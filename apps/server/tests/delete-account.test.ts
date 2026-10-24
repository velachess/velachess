// @vitest-environment node
/**
 * `POST /auth/delete-user` through the real app: Better Auth's own route,
 * real migrations, a real file store and real pg-boss deliveries.
 */
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { eq } from "drizzle-orm";
import { parseResponse } from "hono/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  IMPORTED_PLAYER_NAME,
  LOOPER_USERNAME,
  MIXED_COLOR_PGN,
} from "@velachess/fixtures";
import { countUsers, schema, upsertProviderProfile } from "@velachess/infra-db";
import { chessComFixtureFetch } from "@velachess/test-utils";
import { bootstrapUser } from "@velachess/user";

import { buildBootstrapUserDeps } from "../src/composition/user.ts";
import { createApiHarness, type ApiHarness, type AuthedApp } from "./harness.ts";

let harness: ApiHarness;

beforeAll(async () => {
  harness = await createApiHarness();
});

afterAll(async () => {
  await harness.close();
});

const PASSWORD = "test-password-123";

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const WEBP = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
  0x38, 0x4c, 0x0d, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00, 0x10, 0x07, 0x10, 0x11,
  0x11, 0x88, 0x88, 0xfe, 0x07, 0x00,
]);

const avatarKey = (userId: string) => `avatars/${userId}.webp`;

function deleteSelf(
  app: AuthedApp,
  body: { password?: string } = { password: PASSWORD },
) {
  return app.request("/auth/delete-user", json(body));
}

const NOTHING = {
  users: 0,
  sessions: 0,
  auth_accounts: 0,
  tracked_accounts: 0,
  games: 0,
  sync_jobs: 0,
  verifications: 0,
};

/** Every row that names the user, table by table. */
async function ownedRows(userId: string) {
  const { rows } = await harness.pglite.query<typeof NOTHING>(
    `select
       (select count(*)::int from users where id = $1) as users,
       (select count(*)::int from sessions where user_id = $1) as sessions,
       (select count(*)::int from auth_accounts where user_id = $1) as auth_accounts,
       (select count(*)::int from tracked_accounts where user_id = $1) as tracked_accounts,
       (select count(*)::int from games where user_id = $1) as games,
       (select count(*)::int from sync_jobs where user_id = $1) as sync_jobs,
       (select count(*)::int from verifications where value = $1::text) as verifications`,
    [userId],
  );
  const [counts] = rows;
  if (!counts) throw new Error("count query returned no row");
  return counts;
}

/** A person with something in every table deletion has to reach. */
async function aFullAccount(email: string) {
  const signedUp = await harness.signUp(email, PASSWORD);
  const { app, userId } = signedUp;

  await parseResponse(
    app.api.me.avatar.$post({ json: { image: WEBP.toString("base64") } }),
  );
  const account = await parseResponse(
    app.api.accounts.$post({
      json: { platform: "chess_com", username: LOOPER_USERNAME },
    }),
  );
  if (!account.syncId) throw new Error("expected a first sync on a fresh connect");
  await harness.runSync(account.syncId);
  const imported = await app.request(
    "/games/import",
    json({
      pgn: MIXED_COLOR_PGN,
      participation: { mode: "byName", playerName: IMPORTED_PLAYER_NAME },
    }),
  );
  if (!imported.ok) throw new Error(`pgn import failed: ${imported.status}`);
  await harness.db.insert(schema.verifications).values({
    identifier: `reset-password:${email}`,
    value: userId,
    expiresAt: new Date(Date.now() + 3_600_000),
  });

  return { ...signedUp, accountId: account.id };
}

/** Held mid-fetch until `release` is called. */
function heldFetch(answer: typeof fetch) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let reached!: () => void;
  const fetching = new Promise<void>((resolve) => (reached = resolve));
  const held: typeof fetch = async (...args) => {
    reached();
    await released;
    return answer(...args);
  };
  return { held, fetching, release };
}

describe("deleting your account", () => {
  it("removes the user and every row and file they own", async () => {
    const owner = await aFullAccount("delete-everything@test.local");
    const before = await ownedRows(owner.userId);
    expect(before.games).toBeGreaterThan(0);
    expect(before.verifications).toBe(1);
    expect(await harness.deps.files.get(avatarKey(owner.userId))).not.toBeNull();

    const response = await deleteSelf(owner.app);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, message: "User deleted" });
    expect(await ownedRows(owner.userId)).toEqual(NOTHING);
    expect(await harness.deps.files.get(avatarKey(owner.userId))).toBeNull();
  });

  it("ends the session at once: the old cookie opens nothing", async () => {
    const owner = await harness.signUp("delete-signs-out@test.local", PASSWORD);

    const response = await deleteSelf(owner.app);

    expect(response.headers.get("set-cookie")).toMatch(/session_token=;.*Max-Age=0/);
    expect((await owner.app.request("/games")).status).toBe(401);
    expect(await (await owner.app.request("/auth/get-session")).json()).toBeNull();
    expect((await deleteSelf(owner.app)).status).toBe(401);
  });

  it("leaves other people and the shared provider metadata alone", async () => {
    const owner = await aFullAccount("delete-me@test.local");
    const bystander = await aFullAccount("not-me@test.local");
    await upsertProviderProfile(
      harness.db,
      { platform: "chess_com", username: LOOPER_USERNAME },
      { status: "fetched", profile: { avatarUrl: null, flair: null } },
    );
    const untouched = await ownedRows(bystander.userId);

    await deleteSelf(owner.app);

    expect(await ownedRows(bystander.userId)).toEqual(untouched);
    expect(await harness.deps.files.get(avatarKey(bystander.userId))).not.toBeNull();
    expect((await bystander.app.request("/games")).status).toBe(200);
    expect(
      await harness.db
        .select()
        .from(schema.providerProfiles)
        .where(eq(schema.providerProfiles.username, LOOPER_USERNAME.toLowerCase())),
    ).toHaveLength(1);
  });
});

describe("proving it is you", () => {
  it("refuses a wrong password and deletes nothing", async () => {
    const owner = await harness.signUp("delete-wrong-password@test.local", PASSWORD);
    const before = await ownedRows(owner.userId);

    const response = await deleteSelf(owner.app, { password: "not-the-password" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_PASSWORD" });
    expect(await ownedRows(owner.userId)).toEqual(before);
  });

  it("accepts a session signed in within the last day without the password", async () => {
    const owner = await harness.signUp("delete-fresh-session@test.local", PASSWORD);

    expect((await deleteSelf(owner.app, {})).status).toBe(200);
    expect(await ownedRows(owner.userId)).toEqual(NOTHING);
  });

  it("asks an older session for the password", async () => {
    const owner = await harness.signUp("delete-stale-session@test.local", PASSWORD);
    await harness.db
      .update(schema.sessions)
      .set({ createdAt: new Date(Date.now() - 2 * 86_400_000) })
      .where(eq(schema.sessions.userId, owner.userId));

    const stale = await deleteSelf(owner.app, {});
    expect(stale.status).toBe(400);
    expect(await stale.json()).toMatchObject({ code: "SESSION_EXPIRED" });
    expect((await ownedRows(owner.userId)).users).toBe(1);

    expect((await deleteSelf(owner.app)).status).toBe(200);
  });

  it("refuses a request with no session", async () => {
    const response = await harness.app.request("/auth/delete-user", json({}));

    expect(response.status).toBe(401);
  });
});

describe("sync jobs that outlive the account", () => {
  it("a delivery queued before the deletion writes nothing", async () => {
    const owner = await harness.signUp("delete-queued-sync@test.local", PASSWORD);
    const account = await parseResponse(
      owner.app.api.accounts.$post({
        json: { platform: "chess_com", username: LOOPER_USERNAME },
      }),
    );
    if (!account.syncId) throw new Error("expected a first sync on a fresh connect");

    await deleteSelf(owner.app);
    await harness.runSync(account.syncId);

    expect(await ownedRows(owner.userId)).toEqual(NOTHING);
  });

  it("a delivery mid-fetch when the account goes writes nothing", async () => {
    const owner = await harness.signUp("delete-running-sync@test.local", PASSWORD);
    const account = await parseResponse(
      owner.app.api.accounts.$post({
        json: { platform: "chess_com", username: LOOPER_USERNAME },
      }),
    );
    if (!account.syncId) throw new Error("expected a first sync on a fresh connect");
    const held = heldFetch(chessComFixtureFetch());
    const syncing = harness.runSync(account.syncId, held.held);
    await held.fetching;

    expect((await deleteSelf(owner.app)).status).toBe(200);
    held.release();
    await syncing;

    expect(await ownedRows(owner.userId)).toEqual(NOTHING);
  });
});

describe("when the avatar cannot be removed", () => {
  it("keeps the account whole, and a retry finishes the job", async () => {
    const owner = await aFullAccount("delete-storage-failure@test.local");
    const before = await ownedRows(owner.userId);
    const avatarPath = path.join(harness.filesRoot, avatarKey(owner.userId));
    // A directory where the file was: unlink fails with something other
    // than "missing", which the store does not swallow.
    await rm(avatarPath);
    await mkdir(avatarPath);

    const failed = await deleteSelf(owner.app);

    expect(failed.status).toBe(500);
    expect(await ownedRows(owner.userId)).toEqual(before);
    expect((await owner.app.request("/games")).status).toBe(200);

    await rm(avatarPath, { recursive: true });
    expect((await deleteSelf(owner.app)).status).toBe(200);
    expect(await ownedRows(owner.userId)).toEqual(NOTHING);
  });
});

describe("the only user on an instance", () => {
  it("can delete their account, and bootstrap provisions one again on the next start", async () => {
    const fresh = await createApiHarness();
    try {
      const credentials = { email: "only-user@test.local", password: PASSWORD };
      const bootstrap = () =>
        bootstrapUser(
          buildBootstrapUserDeps(fresh.db, fresh.bootstrapAuth, fresh.lock),
          credentials,
        );
      const first = await bootstrap();
      if (first.status !== "created") throw new Error("expected a bootstrapped user");
      const cookie = await fresh.signIn(credentials.email, credentials.password);

      const response = await fresh.app.request("/auth/delete-user", {
        ...json({ password: PASSWORD }),
        headers: { "content-type": "application/json", cookie },
      });

      expect(response.status).toBe(200);
      expect(await countUsers(fresh.db)).toBe(0);

      const again = await bootstrap();
      expect(again.status).toBe("created");
      await expect(
        fresh.signIn(credentials.email, credentials.password),
      ).resolves.toMatch(/session_token=/);
    } finally {
      await fresh.close();
    }
  });
});
