// @vitest-environment node
/**
 * The session gate and the ownership walls, over the real harness.
 *
 * Everything here goes through HTTP the way a browser would: real
 * Better Auth sign-up, a real session cookie, and the same middleware
 * production runs. No bypass exists to test around, which is the point.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bootstrapUser } from "@velachess/application/auth/bootstrap-user/bootstrap-user";
import { createAuth, GOOGLE_CALLBACK_PATH } from "@velachess/auth";
import { eq } from "drizzle-orm";

import { schema } from "@velachess/db";

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
    const first = await bootstrapUser(harness.db, harness.bootstrapAuth, harness.lock, {
      email: "admin@velachess.local",
      password: "dev-password",
    });
    expect(first.status).toBe("created");
    // The created outcome exposes status and userId — nothing else, by
    // construction, which is what makes main.ts's log of it safe.
    expect(Object.keys(first).sort()).toEqual(["status", "userId"]);
    expect(JSON.stringify(first)).not.toContain("dev-password");

    // A second startup with the same env does nothing — the guard is
    // "any user exists", so re-running cannot touch anyone's credentials.
    const second = await bootstrapUser(harness.db, harness.bootstrapAuth, harness.lock, {
      email: "admin@velachess.local",
      password: "dev-password",
    });
    expect(second).toEqual({ status: "skipped", reason: "users-exist" });

    // Not even with different credentials: an installation with users
    // manages them through real auth, never through startup env.
    const hijack = await bootstrapUser(harness.db, harness.bootstrapAuth, harness.lock, {
      email: "admin@velachess.local",
      password: "a-different-password",
    });
    expect(hijack).toEqual({ status: "skipped", reason: "users-exist" });

    // A different email skips just the same — the guard is the table,
    // not the address.
    const other = await bootstrapUser(harness.db, harness.bootstrapAuth, harness.lock, {
      email: "someone-else@velachess.local",
      password: "dev-password",
    });
    expect(other).toEqual({ status: "skipped", reason: "users-exist" });

    const rows = await harness.db.select().from(schema.users);
    expect(rows).toHaveLength(1);
    // Better Auth's own sign-up writes emailVerified: false; bootstrapUser
    // corrects it, or this account can never link a Google sign-in on the
    // same email (Better Auth refuses with account_not_linked, always).
    expect(rows[0]!.emailVerified).toBe(true);
  });

  it("does nothing when the env is not configured", async () => {
    expect(
      await bootstrapUser(harness.db, harness.bootstrapAuth, harness.lock, null),
    ).toEqual({
      status: "skipped",
      reason: "not-configured",
    });
  });

  it("outcomes carry status words alone — safe to log verbatim", async () => {
    // main.ts logs the outcome as-is. Serialize every answerable shape
    // the way pino would and prove no credential survives into any of
    // them; the created shape is pinned to exactly {status, userId}.
    const skipped = await bootstrapUser(harness.db, harness.bootstrapAuth, harness.lock, {
      email: "canary-email@velachess.local",
      password: "canary-password-value",
    });
    const notConfigured = await bootstrapUser(
      harness.db,
      harness.bootstrapAuth,
      harness.lock,
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
  // Its own harness: the race only exists against an EMPTY user table,
  // and the shared harness above has already provisioned one.
  let fresh: ApiHarness;

  beforeAll(async () => {
    fresh = await createApiHarness();
  });

  afterAll(async () => {
    await fresh.close();
  });

  it("three simultaneous bootstraps yield exactly one user", async () => {
    // Three API instances starting against the same empty database, over
    // the real advisory-lock implementation the harness runs (actual
    // pg_try_advisory_lock SQL through PGlite — see
    // libs/test-utils/harness.ts — not a mock). One acquires and
    // creates; every loser answers concurrent-startup and moves on — the
    // user it would have created is the one being created.
    const credentials = { email: "user@velachess.local", password: "dev-password" };
    const outcomes = await Promise.all([
      bootstrapUser(fresh.db, fresh.bootstrapAuth, fresh.lock, credentials),
      bootstrapUser(fresh.db, fresh.bootstrapAuth, fresh.lock, credentials),
      bootstrapUser(fresh.db, fresh.bootstrapAuth, fresh.lock, credentials),
    ]);

    const statuses = outcomes.map((o) => o.status).sort();
    expect(statuses).toEqual(["created", "skipped", "skipped"]);
    for (const skipped of outcomes.filter((o) => o.status === "skipped")) {
      expect(skipped).toEqual({ status: "skipped", reason: "concurrent-startup" });
    }

    const rows = await fresh.db.select().from(schema.users);
    expect(rows).toHaveLength(1);

    // And the winner's user signs in through the normal flow.
    const cookie = await fresh.signIn(credentials.email, credentials.password);
    expect(cookie).toContain("=");
  });
});

describe("the adapter writes our tables, our names", () => {
  // The mapping the config claims — modelName per entity, display_name
  // for Better Auth's `name`, uuid ids — proven against rows, not read
  // back through Better Auth (which would agree with itself by
  // construction).
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
    // Better Auth speaks `name`; the column is display_name. The value
    // arriving here is the mapping working end to end.
    expect(user!.displayName).toBeTruthy();
    expect(user!.email).toBe("mapping@test.local");

    const credentials = await harness.db
      .select()
      .from(schema.authAccounts)
      .where(eq(schema.authAccounts.userId, userId));
    expect(credentials).toHaveLength(1);
    expect(credentials[0]!.providerId).toBe("credential");
    // Hashed by Better Auth's own path — never the raw password.
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
    // The mounted instance closes sign-up (`allowSignUp` defaults to
    // false): a self-hosted install reachable on a network must not
    // accept account creation from whoever finds it. Server-side
    // creation (bootstrap, harness.signUp) goes through the unmounted
    // signup-enabled twin — the adapter-mapping test above proves that
    // path still works.
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
    // Bootstrap is env-var provisioning at startup; nothing on the wire
    // can trigger it. These paths answer like any other unknown route.
    for (const path of ["/bootstrap", "/setup", "/auth/bootstrap", "/auth/setup"]) {
      // oxlint-disable-next-line eslint/no-await-in-loop
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

    const { url } = (await response.json()) as { url: string };
    const authorize = new URL(url);
    expect(authorize.origin).toBe("https://accounts.google.com");
    expect(authorize.searchParams.get("client_id")).toBe("client-id");
    // Pinned deliberately: an explicit redirectURI (auth.ts) keeps the
    // OAuth return leg on the same /api/* proxy contract every other auth
    // call already uses — no second proxy rule to remember.
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      `https://chess.example.com${GOOGLE_CALLBACK_PATH}`,
    );
    // PKCE, not an implicit flow.
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
    // The same database, configured the way an https production is —
    // proving `secureCookies: true` reaches the Set-Cookie attributes.
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
    for (const path of ["/overview", "/games", "/repertoires", "/drill/queue"]) {
      // oxlint-disable-next-line eslint/no-await-in-loop
      const response = await harness.app.request(path);
      expect(response.status, path).toBe(401);
    }
  });

  it("signs the bootstrap user in and resolves their identity", async () => {
    const cookie = await harness.signIn("admin@velachess.local", "dev-password");
    expect(cookie).toContain("=");

    const response = await harness.app.request("/overview", {
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    // A fresh admin owns nothing — the counts prove the request resolved
    // to a real, scoped user rather than to anything ambient.
    expect(await response.json()).toEqual({
      games: 0,
      deviations: 0,
      exercises: 0,
      dueCards: 0,
    });
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
    expect((await harness.app.request("/overview", { headers: { cookie } })).status).toBe(
      200,
    );

    const out = await harness.app.request("/auth/sign-out", {
      method: "POST",
      headers: { cookie },
    });
    expect(out.ok).toBe(true);

    // Database-backed sessions are the reason this is immediate: the row
    // is gone, so the same cookie is now nobody.
    expect((await harness.app.request("/overview", { headers: { cookie } })).status).toBe(
      401,
    );
  });
});

describe("ownership isolation", () => {
  let alice: AuthedApp;
  let bob: AuthedApp;

  beforeAll(async () => {
    alice = (await harness.signUp("alice@test.local")).app;
    bob = (await harness.signUp("bob@test.local")).app;
  });

  it("two users track the same public username independently", async () => {
    // Usernames are public — a handle is nobody's property. Each user gets
    // their own connection row; before this, the second import silently
    // transferred the first user's entire archive.
    const aliceImport = await alice.request(
      "/accounts",
      json({ platform: "chess_com", username: "looper" }),
    );
    expect(aliceImport.status).toBe(201);
    const aliceAccount = (await aliceImport.json()) as { id: string };

    const bobImport = await bob.request(
      "/accounts",
      json({ platform: "chess_com", username: "looper" }),
    );
    expect(bobImport.status).toBe(201);
    const bobAccount = (await bobImport.json()) as { id: string };

    expect(bobAccount.id).not.toBe(aliceAccount.id);

    // Both still own theirs — nothing transferred.
    const aliceList = (await (await alice.request("/accounts")).json()) as {
      id: string;
    }[];
    const bobList = (await (await bob.request("/accounts")).json()) as { id: string }[];
    expect(aliceList.map((a) => a.id)).toContain(aliceAccount.id);
    expect(bobList.map((a) => a.id)).toContain(bobAccount.id);
  });

  it("a stranger's account id answers 404, for reads and for sync", async () => {
    const [aliceAccount] = (await (await alice.request("/accounts")).json()) as {
      id: string;
    }[];

    expect((await bob.request(`/accounts/${aliceAccount!.id}/games`)).status).toBe(404);
    expect(
      (await bob.request(`/accounts/${aliceAccount!.id}/sync`, { method: "POST" }))
        .status,
    ).toBe(404);
  });

  it("a stranger's game is unreadable, unanalyzable and unwatchable", async () => {
    const library = (await (await alice.request("/games")).json()) as {
      games: { id: string }[];
    };
    const gameId = library.games[0]!.id;

    // The owner reads it fine; the stranger gets the same 404 a missing
    // id would produce — the route never confirms which uuids exist.
    expect((await alice.request(`/games/${gameId}`)).status).toBe(200);
    expect((await bob.request(`/games/${gameId}`)).status).toBe(404);
    expect((await bob.request(`/games/${gameId}/analysis`)).status).toBe(404);
    expect(
      (await bob.request(`/games/${gameId}/analyze`, { method: "POST" })).status,
    ).toBe(404);
    expect((await bob.request(`/games/${gameId}/analysis/events`)).status).toBe(404);
  });

  it("a stranger's repertoire cannot be read, extended or deleted", async () => {
    const created = (await (
      await alice.request("/repertoires", json({ name: "White e4", color: "white" }))
    ).json()) as { id: string };

    expect((await bob.request(`/repertoires/${created.id}`)).status).toBe(404);
    expect(
      (
        await bob.request(
          `/repertoires/${created.id}/chapters`,
          json({ name: "Trap", pgn: "1. e4 *" }),
        )
      ).status,
    ).toBe(404);
    expect(
      (await bob.request(`/repertoires/${created.id}`, { method: "DELETE" })).status,
    ).toBe(404);

    // Still Alice's, chapters untouched.
    const still = (await (await alice.request(`/repertoires/${created.id}`)).json()) as {
      chapters: unknown[];
    };
    expect(still.chapters).toHaveLength(0);
  });

  it("a stranger's exercise cannot be answered", async () => {
    // Seeded at the db layer — the triage pipeline has its own suites;
    // what this test owns is the wall around POST /drill/answer.
    const aliceUsers = (await (await alice.request("/accounts")).json()) as {
      id: string;
    }[];
    expect(aliceUsers.length).toBeGreaterThan(0);
    const { upsertExercise } = await import("@velachess/db");
    const aliceRows = await harness.db.select().from(schema.trackedAccounts);
    const aliceUserId = aliceRows.find((row) => row.id === aliceUsers[0]!.id)!.userId;
    // The provenance must reference a real game — Alice imported one.
    const [aliceGame] = (await (
      await alice.request(`/accounts/${aliceUsers[0]!.id}/games`)
    ).json()) as { id: string }[];
    // A Queen's Gambit position (1.d4 d5 2.c4), deliberately outside the
    // book Alice's import derived from her 1.e4 archive: exercises are
    // keyed by position, so seeding the STARTING position would collide
    // with the derived book's first decision and inherit its answer.
    await upsertExercise(harness.db, aliceUserId, {
      positionKey: "rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq -",
      expectedSans: ["e6"],
      origin: { kind: "engine-blunder", gameId: aliceGame!.id, ply: 4 },
    });

    // Scoped to the engine origin so the pick is this exercise and not a
    // line position from the derived book.
    const next = await alice.request("/drill/next?source=engine-blunder");
    expect(next.status).toBe(200);
    const item = (await next.json()) as { exerciseId: string };

    // Bob answering Alice's exercise: 404, and her card does not move.
    const attack = await bob.request(
      "/drill/answer",
      json({ exerciseId: item.exerciseId, san: "e6" }),
    );
    expect(attack.status).toBe(404);

    const answered = await alice.request(
      "/drill/answer",
      json({ exerciseId: item.exerciseId, san: "e6" }),
    );
    expect(answered.status).toBe(200);
    expect(((await answered.json()) as { correct: boolean }).correct).toBe(true);
  });
});
