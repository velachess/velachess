// @vitest-environment node
import { randomUUID } from "node:crypto";

import { parseResponse } from "hono/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bootstrapUser } from "@velachess/user";
import { buildBootstrapUserDeps } from "../src/composition/user.ts";
import { createAuth, GOOGLE_CALLBACK_PATH } from "@velachess/infra-auth";
import { eq } from "drizzle-orm";

import { schema } from "@velachess/infra-db";
import {
  LISTER_AS_BLACK_PGN,
  LISTER_AS_WHITE_PGN,
  LISTER_USERNAME,
  LOOPER_USERNAME,
} from "@velachess/fixtures";

import { createApiHarness, type ApiHarness, type AuthedApp } from "./harness.ts";

let harness: ApiHarness;

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

beforeAll(async () => {
  harness = await createApiHarness();
});

afterAll(async () => {
  await harness.close();
});

describe("bootstrap", () => {
  it("creates the first user once, from env-shaped credentials", async () => {
    const first = await bootstrapUser(
      buildBootstrapUserDeps(harness.db, harness.bootstrapAuth, harness.lock),
      {
        email: "admin@velachess.local",
        password: "dev-password",
      },
    );
    expect(first.status).toBe("created");
    // Nothing but status and userId, which is what makes main.ts's log of
    // it safe.
    expect(Object.keys(first).toSorted()).toEqual(["status", "userId"]);
    expect(JSON.stringify(first)).not.toContain("dev-password");

    // The guard is "any user exists", so re-running cannot touch anyone's
    // credentials.
    const second = await bootstrapUser(
      buildBootstrapUserDeps(harness.db, harness.bootstrapAuth, harness.lock),
      {
        email: "admin@velachess.local",
        password: "dev-password",
      },
    );
    expect(second).toEqual({ status: "skipped", reason: "users-exist" });

    // An installation with users manages them through real auth, never
    // through startup env.
    const hijack = await bootstrapUser(
      buildBootstrapUserDeps(harness.db, harness.bootstrapAuth, harness.lock),
      {
        email: "admin@velachess.local",
        password: "a-different-password",
      },
    );
    expect(hijack).toEqual({ status: "skipped", reason: "users-exist" });

    // The guard is the table, not the address.
    const other = await bootstrapUser(
      buildBootstrapUserDeps(harness.db, harness.bootstrapAuth, harness.lock),
      {
        email: "someone-else@velachess.local",
        password: "dev-password",
      },
    );
    expect(other).toEqual({ status: "skipped", reason: "users-exist" });

    const rows = await harness.db.select().from(schema.users);
    expect(rows).toHaveLength(1);
    // Better Auth's sign-up writes false, and without the correction this
    // account can never link a Google sign-in on the same email
    // (account_not_linked).
    expect(rows[0]!.emailVerified).toBe(true);
  });

  it("does nothing when the env is not configured", async () => {
    expect(
      await bootstrapUser(
        buildBootstrapUserDeps(harness.db, harness.bootstrapAuth, harness.lock),
        null,
      ),
    ).toEqual({
      status: "skipped",
      reason: "not-configured",
    });
  });

  it("outcomes carry status words alone — safe to log verbatim", async () => {
    // main.ts logs the outcome as-is, so every answerable shape is
    // serialized the way pino would and checked for credentials.
    const skipped = await bootstrapUser(
      buildBootstrapUserDeps(harness.db, harness.bootstrapAuth, harness.lock),
      {
        email: "canary-email@velachess.local",
        password: "canary-password-value",
      },
    );
    const notConfigured = await bootstrapUser(
      buildBootstrapUserDeps(harness.db, harness.bootstrapAuth, harness.lock),
      null,
    );
    for (const outcome of [skipped, notConfigured]) {
      const logged = JSON.stringify(outcome);
      expect(logged).not.toContain("canary-password-value");
      expect(logged).not.toContain("canary-email");
    }
  });
});

describe("bootstrap under concurrent startup", () => {
  // Its own harness: the race only exists against an empty user table.
  let fresh: ApiHarness;

  beforeAll(async () => {
    fresh = await createApiHarness();
  });

  afterAll(async () => {
    await fresh.close();
  });

  it("three simultaneous bootstraps yield exactly one user", async () => {
    // Three API instances against the same empty database, over the real
    // `pg_try_advisory_lock` the harness runs. One creates; every loser
    // answers concurrent-startup, the user it would have created being the
    // one in flight.
    const credentials = { email: "user@velachess.local", password: "dev-password" };
    const outcomes = await Promise.all([
      bootstrapUser(
        buildBootstrapUserDeps(fresh.db, fresh.bootstrapAuth, fresh.lock),
        credentials,
      ),
      bootstrapUser(
        buildBootstrapUserDeps(fresh.db, fresh.bootstrapAuth, fresh.lock),
        credentials,
      ),
      bootstrapUser(
        buildBootstrapUserDeps(fresh.db, fresh.bootstrapAuth, fresh.lock),
        credentials,
      ),
    ]);

    const statuses = outcomes.map((o) => o.status).toSorted();
    expect(statuses).toEqual(["created", "skipped", "skipped"]);
    for (const skipped of outcomes.filter((o) => o.status === "skipped")) {
      expect(skipped).toEqual({ status: "skipped", reason: "concurrent-startup" });
    }

    const rows = await fresh.db.select().from(schema.users);
    expect(rows).toHaveLength(1);

    const cookie = await fresh.signIn(credentials.email, credentials.password);
    expect(cookie).toContain("=");
  });
});

describe("the adapter writes our tables, our names", () => {
  // Proven against rows rather than read back through Better Auth, which
  // would agree with itself by construction.
  it("a signup lands in users/auth_accounts with a uuid id and display_name", async () => {
    const { userId, cookie } = await harness.signUp("mapping@test.local");

    expect(userId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    const [user] = await harness.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(user).toBeDefined();
    // Better Auth speaks `name`; the column is display_name.
    expect(user!.displayName).toBeTruthy();
    expect(user!.email).toBe("mapping@test.local");

    const credentials = await harness.db
      .select()
      .from(schema.authAccounts)
      .where(eq(schema.authAccounts.userId, userId));
    expect(credentials).toHaveLength(1);
    expect(credentials[0]!.providerId).toBe("credential");
    expect(credentials[0]!.password).not.toBe("test-password-123");

    const sessions = await harness.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId));
    expect(sessions.length).toBeGreaterThan(0);
    expect(cookie).toContain("=");
  });
});

describe("the closed surfaces", () => {
  it("POST /auth/sign-up/email is not a way in", async () => {
    // The mounted instance closes sign-up, so a reachable self-host accepts
    // no account creation. Server-side creation goes through the unmounted
    // signup-enabled twin.
    const before = (await harness.db.select().from(schema.users)).length;

    const response = await harness.app.request("/auth/sign-up/email", {
      ...json({
        name: "Mallory",
        email: "mallory@evil.example",
        password: "mallory-password-123",
      }),
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();

    const after = (await harness.db.select().from(schema.users)).length;
    expect(after).toBe(before);
  });

  it("no bootstrap or setup HTTP surface exists", async () => {
    // Bootstrap is env-var provisioning at startup, and nothing on the wire
    // can trigger it.
    for (const path of ["/bootstrap", "/setup", "/auth/bootstrap", "/auth/setup"]) {
      const response = await harness.app.request(path, { method: "POST" });
      expect([401, 404], path).toContain(response.status);
      expect(response.headers.get("set-cookie"), path).toBeNull();
    }
  });
});

describe("Google sign-in", () => {
  it("sends the user to Google, and asks to be returned to /auth/callback", async () => {
    const googleAuth = createAuth({
      db: harness.db,
      baseUrl: "https://chess.example.com",
      secret: "test-secret-at-least-32-characters-long",
      secureCookies: true,
      google: { clientId: "client-id", clientSecret: "client-secret" },
    });

    const response = await googleAuth.handler(
      new Request("https://chess.example.com/auth/sign-in/social", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://chess.example.com",
        },
        body: JSON.stringify({ provider: "google", callbackURL: "/" }),
      }),
    );
    expect(response.status).toBe(200);

    const { url }: { url: string } = await response.json();
    const authorize = new URL(url);
    expect(authorize.origin).toBe("https://accounts.google.com");
    expect(authorize.searchParams.get("client_id")).toBe("client-id");
    // The explicit redirectURI keeps the OAuth return leg on the same
    // /api/* proxy contract as every other auth call.
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      `https://chess.example.com${GOOGLE_CALLBACK_PATH}`,
    );
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("is not offered when no credentials are configured", async () => {
    const response = await harness.app.request("/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/" }),
    });
    expect(response.ok).toBe(false);
  });
});

describe("secure cookies behind TLS", () => {
  it("an https deployment sets Secure on the session cookie", async () => {
    // The same database, configured the way an https production is.
    const secureAuth = createAuth({
      db: harness.db,
      baseUrl: "https://chess.example.com",
      secret: "test-secret-at-least-32-characters-long",
      secureCookies: true,
    });

    const response = await secureAuth.handler(
      new Request("https://chess.example.com/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "admin@velachess.local",
          password: "dev-password",
        }),
      }),
    );
    expect(response.status).toBe(200);

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
  });
});

describe("the session gate", () => {
  it("rejects an unauthenticated request with 401, uniformly", async () => {
    for (const path of ["/games", "/accounts"]) {
      const response = await harness.app.request(path);
      expect(response.status, path).toBe(401);
    }
  });

  it("signs the bootstrap user in and resolves their identity", async () => {
    const cookie = await harness.signIn("admin@velachess.local", "dev-password");
    expect(cookie).toContain("=");

    const response = await harness.app.request("/games", {
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    // A fresh admin owns nothing, so the empty library proves the request
    // resolved to a scoped user.
    expect(await response.json()).toMatchObject({ games: [], total: 0 });
  });

  it("rejects a wrong password and sets no session", async () => {
    const response = await harness.app.request("/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@velachess.local", password: "wrong" }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("logout ends access for the cookie that held it", async () => {
    const cookie = await harness.signIn("admin@velachess.local", "dev-password");
    expect((await harness.app.request("/games", { headers: { cookie } })).status).toBe(
      200,
    );

    const out = await harness.app.request("/auth/sign-out", {
      method: "POST",
      headers: { cookie },
    });
    expect(out.ok).toBe(true);

    expect((await harness.app.request("/games", { headers: { cookie } })).status).toBe(
      401,
    );
  });
});

async function connectLooper(app: AuthedApp) {
  const account = await parseResponse(
    app.api.accounts.$post({
      json: { platform: "chess_com", username: LOOPER_USERNAME },
    }),
  );
  if (!account.syncId) throw new Error("expected a first sync on a fresh connect");
  return { id: account.id, syncId: account.syncId };
}

/** Every user gets the same public handle and the same file, so two
 * libraries hold identical games and only ownership tells them apart. */
async function aUserWithALibrary(email: string) {
  const { app } = await harness.signUp(email);
  const account = await connectLooper(app);
  await harness.runSync(account.syncId);
  const imported = await app.request(
    "/games/import",
    json({
      pgn: `${LISTER_AS_WHITE_PGN}\n${LISTER_AS_BLACK_PGN}`,
      participation: { mode: "byName", playerName: LISTER_USERNAME },
    }),
  );
  expect(imported.status).toBe(200);

  const library = await parseResponse(app.api.games.$get({ query: {} }));
  const firstOf = (source: string) =>
    library.games.find((game) => game.source === source)!.id;
  return {
    app,
    account,
    gameIds: library.games.map((game) => game.id),
    syncedGameId: firstOf("chess_com"),
    pastedGameId: firstOf("pgn"),
  };
}

describe("ownership isolation", () => {
  it("a stranger's game answers exactly like an unknown one, synced or pasted", async () => {
    const alice = await aUserWithALibrary("game-alice@test.local");
    const bob = await aUserWithALibrary("game-bob@test.local");

    const unknown = await bob.app.request(`/games/${randomUUID()}`);
    expect(unknown.status).toBe(404);
    const notFound = await unknown.json();

    for (const id of [alice.syncedGameId, alice.pastedGameId]) {
      expect((await alice.app.request(`/games/${id}`)).status).toBe(200);
      const theirs = await bob.app.request(`/games/${id}`);
      expect(theirs.status).toBe(404);
      expect(await theirs.json()).toEqual(notFound);
    }
  });

  it("a stranger's account id is refused for every operation, and nothing changes", async () => {
    const alice = await aUserWithALibrary("account-alice@test.local");
    const bob = await aUserWithALibrary("account-bob@test.local");
    const accountGames = () =>
      parseResponse(
        alice.app.api.accounts[":id"].games.$get({ param: { id: alice.account.id } }),
      );
    const before = {
      accounts: await parseResponse(alice.app.api.accounts.$get()),
      accountGames: await accountGames(),
      library: await parseResponse(alice.app.api.games.$get({ query: {} })),
    };
    expect(before.accounts).toEqual([
      expect.objectContaining({
        id: alice.account.id,
        syncStatus: "succeeded",
      }),
    ]);

    for (const [method, path] of [
      ["GET", `/accounts/${alice.account.id}/games`],
      ["POST", `/accounts/${alice.account.id}/sync`],
      ["DELETE", `/accounts/${alice.account.id}`],
    ] as const) {
      const response = await bob.app.request(path, { method });
      expect(response.status, `${method} ${path}`).toBe(404);
      expect(await response.json()).toEqual({ error: "account not found" });
    }

    expect(await parseResponse(alice.app.api.accounts.$get())).toEqual(before.accounts);
    expect(await accountGames()).toEqual(before.accountGames);
    expect(await parseResponse(alice.app.api.games.$get({ query: {} }))).toEqual(
      before.library,
    );
    expect(
      (await parseResponse(bob.app.api.accounts.$get())).map(({ id }) => id),
    ).toEqual([bob.account.id]);
  });

  it("syncing everything stays per user, and so does what each list reports", async () => {
    const alice = (await harness.signUp("sync-alice@test.local")).app;
    const bob = (await harness.signUp("sync-bob@test.local")).app;
    const aliceAccount = await connectLooper(alice);
    const bobAccount = await connectLooper(bob);

    expect(await parseResponse(bob.api.accounts.sync.$post())).toEqual({
      syncIds: [bobAccount.syncId],
    });
    expect(await parseResponse(alice.api.accounts.sync.$post())).toEqual({
      syncIds: [aliceAccount.syncId],
    });

    for (const app of [alice, bob]) {
      const listed = await parseResponse(app.api.accounts.$get());
      expect(listed.map(({ id }) => id)).toEqual(
        app === alice ? [aliceAccount.id] : [bobAccount.id],
      );
      expect(listed[0]?.syncStatus).toBe("queued");
    }
  });

  it("the library holds only the caller's games, under every filter and page", async () => {
    await aUserWithALibrary("library-alice@test.local");
    const bob = await aUserWithALibrary("library-bob@test.local");

    // Bob's own library: looper's win and loss, both as White, and lister's
    // win as White at 600 (rapid) and loss as Black at 180+2 (blitz).
    const views = [
      [{}, 4],
      [{ color: "white" }, 3],
      [{ color: "black" }, 1],
      [{ outcome: "win" }, 2],
      [{ outcome: "loss" }, 2],
      [{ timeClass: "rapid" }, 1],
      [{ timeClass: "blitz" }, 1],
      [{ page: "2", pageSize: "1" }, 4],
    ] as const;

    for (const [query, total] of views) {
      const page = await parseResponse(bob.app.api.games.$get({ query }));
      expect(page.total, JSON.stringify(query)).toBe(total);
      expect(page.games.length, JSON.stringify(query)).toBeGreaterThan(0);
      expect(page.games.filter(({ id }) => !bob.gameIds.includes(id))).toEqual([]);
    }
  });

  it("two users track the same public handle independently, and one leaving keeps the other whole", async () => {
    const alice = await aUserWithALibrary("handle-alice@test.local");
    const bob = await aUserWithALibrary("handle-bob@test.local");

    expect(bob.account.id).not.toBe(alice.account.id);
    expect(bob.account.syncId).not.toBe(alice.account.syncId);
    expect(bob.gameIds.filter((id) => alice.gameIds.includes(id))).toEqual([]);
    const aliceAccounts = await parseResponse(alice.app.api.accounts.$get());
    expect(aliceAccounts.map(({ id }) => id)).toEqual([alice.account.id]);
    const aliceLibrary = await parseResponse(alice.app.api.games.$get({ query: {} }));

    expect(
      (await bob.app.api.accounts[":id"].$delete({ param: { id: bob.account.id } }))
        .status,
    ).toBe(204);

    expect(await parseResponse(alice.app.api.accounts.$get())).toEqual(aliceAccounts);
    expect(await parseResponse(alice.app.api.games.$get({ query: {} }))).toEqual(
      aliceLibrary,
    );
    expect((await alice.app.request(`/games/${alice.syncedGameId}`)).status).toBe(200);
  });
});
