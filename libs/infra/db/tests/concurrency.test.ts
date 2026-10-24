// @vitest-environment node
/**
 * Races that need two real connections. PGlite runs one connection, so
 * these only run against a Postgres server (`DATABASE_URL`); CI's
 * Postgres job runs them.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { NormalizedGame } from "@velachess/infra-platforms";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import {
  abandonSyncJob,
  createSyncJob,
  createUser,
  deleteTrackedAccountAndGames,
  deleteUser,
  games,
  claimSyncAttempt,
  markSyncRunning,
  lockLatestSyncJob,
  saveGames,
  schema,
  syncJobs,
  insertTrackedAccount,
  users,
} from "@velachess/infra-db";
import type { Database } from "@velachess/infra-db";

import { createTestDb } from "./test-db.ts";

const url = process.env["DATABASE_URL"];

describe.skipIf(!url)("concurrent writers on Postgres", async () => {
  const { db, close } = await createTestDb();
  const other = postgres(url!, { max: 1 });
  const otherDb = drizzle(other, { schema });
  afterAll(async () => {
    await other.end();
    await close();
  });

  const lateGame: NormalizedGame = {
    source: "chess_com",
    externalId: "late",
    externalUrl: null,
    perspective: null,
    white: { name: "racer" },
    black: { name: "rival" },
    result: "1-0",
    timeControl: {},
    opening: {},
    hasClocks: false,
    rawPgn: "1. e4 1-0",
    movetextHash: "late-hash",
  };

  async function anAccount() {
    const user = await createUser(db);
    const account = (await insertTrackedAccount(db, user.id, "chess_com", "racer"))!;
    return { userId: user.id, accountId: account.id };
  }

  /** A sync insert on the other connection, held open until released. */
  function heldInsert(owner: { userId: string; accountId: string }) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let inserted!: () => void;
    const didInsert = new Promise<void>((resolve) => (inserted = resolve));
    const committed = otherDb.transaction(async (tx) => {
      await saveGames(tx, [lateGame], owner);
      inserted();
      await gate;
    });
    return { didInsert, release, committed };
  }

  const gamesOf = (userId: string) =>
    db.select().from(games).where(eq(games.userId, userId));

  it("a disconnect waiting on an in-flight insert deletes that game too", async () => {
    const owner = await anAccount();
    const insert = heldInsert(owner);
    await insert.didInsert;

    const deleting = deleteTrackedAccountAndGames(db, owner.accountId);
    await new Promise((resolve) => setTimeout(resolve, 200));
    insert.release();
    await insert.committed;
    await deleting;

    // Not even an orphan with its account nulled.
    expect(await gamesOf(owner.userId)).toEqual([]);
  });

  it("an insert after the disconnect fails instead of writing", async () => {
    const owner = await anAccount();
    await deleteTrackedAccountAndGames(db, owner.accountId);

    await expect(saveGames(otherDb, [lateGame], owner)).rejects.toThrow();
    expect(await gamesOf(owner.userId)).toEqual([]);
  });

  /** A transaction on the other connection: `first` runs, then it waits for `release` before `then`. */
  function heldTransaction(
    first: (tx: Database) => Promise<unknown>,
    then: (tx: Database) => Promise<unknown>,
  ) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let reached!: () => void;
    const didFirst = new Promise<void>((resolve) => (reached = resolve));
    const committed = otherDb.transaction(async (tx) => {
      await first(tx);
      reached();
      await gate;
      await then(tx);
    });
    return { didFirst, release, committed };
  }

  it("a disconnect during a sync's final write waits for it instead of deadlocking", async () => {
    const owner = await anAccount();
    const job = (await createSyncJob(db, { ...owner, trigger: "manual" }))!;
    const run = (await markSyncRunning(db, job.id))!;
    // The worker's commit order: its job first, then the games.
    const sync = heldTransaction(
      (tx) => claimSyncAttempt(tx, { id: job.id, startedAt: run.startedAt }),
      (tx) => saveGames(tx, [lateGame], owner),
    );
    await sync.didFirst;

    const deleting = deleteTrackedAccountAndGames(db, owner.accountId);
    await new Promise((resolve) => setTimeout(resolve, 200));
    sync.release();

    await expect(sync.committed).resolves.toBeUndefined();
    await expect(deleting).resolves.toBeUndefined();
    expect(await gamesOf(owner.userId)).toEqual([]);
  });

  it("a disconnect during a sync request waits for it instead of deadlocking", async () => {
    const owner = await anAccount();
    const done = (await createSyncJob(db, { ...owner, trigger: "manual" }))!;
    await db
      .update(syncJobs)
      .set({ status: "succeeded" })
      .where(eq(syncJobs.id, done.id));

    // requestSync's order: the latest job first, then the new one.
    const request = heldTransaction(
      (tx) => lockLatestSyncJob(tx, owner.accountId),
      (tx) => createSyncJob(tx, { ...owner, trigger: "manual" }),
    );
    await request.didFirst;

    const deleting = deleteTrackedAccountAndGames(db, owner.accountId);
    await new Promise((resolve) => setTimeout(resolve, 200));
    request.release();

    await expect(request.committed).resolves.toBeUndefined();
    await expect(deleting).resolves.toBeUndefined();
    expect(
      await db.select().from(syncJobs).where(eq(syncJobs.accountId, owner.accountId)),
    ).toEqual([]);
  });

  it("after a lock holder abandons and replaces the latest job, its waiter re-locks the replacement", async () => {
    const owner = await anAccount();
    const dead = (await createSyncJob(db, { ...owner, trigger: "manual" }))!;
    await db
      .update(syncJobs)
      .set({ status: "running", createdAt: new Date(Date.now() - 600_000) })
      .where(eq(syncJobs.id, dead.id));

    // The steps requestSync takes once the queue reports the delivery dead:
    // the waiter is refused a second job by the index and finds the first.
    const recover = (conn: Database) =>
      conn.transaction(async (tx) => {
        const latest = (await lockLatestSyncJob(tx, owner.accountId))!;
        if (latest.status === "running") await abandonSyncJob(tx, latest.id);
        const job = await createSyncJob(tx, { ...owner, trigger: "manual" });
        return job ?? (await lockLatestSyncJob(tx, owner.accountId))!;
      });
    const [mine, theirs] = await Promise.all([recover(db), recover(otherDb)]);

    expect(theirs.id).toBe(mine.id);
    const jobs = await db
      .select()
      .from(syncJobs)
      .where(eq(syncJobs.accountId, owner.accountId));
    expect(jobs.map((job) => job.status).toSorted()).toEqual(["failed", "queued"]);
  });

  it("two concurrent sync triggers create one job", async () => {
    const owner = await anAccount();
    const [mine, theirs] = await Promise.all([
      db.transaction((tx) => createSyncJob(tx, { ...owner, trigger: "manual" })),
      otherDb.transaction((tx) => createSyncJob(tx, { ...owner, trigger: "manual" })),
    ]);

    expect([mine, theirs].filter(Boolean)).toHaveLength(1);
  });
  it("deleting a user during a sync's final write waits for it instead of deadlocking", async () => {
    const owner = await anAccount();
    const job = (await createSyncJob(db, { ...owner, trigger: "manual" }))!;
    const run = (await markSyncRunning(db, job.id))!;
    const sync = heldTransaction(
      (tx) => claimSyncAttempt(tx, { id: job.id, startedAt: run.startedAt }),
      (tx) => saveGames(tx, [lateGame], owner),
    );
    await sync.didFirst;

    const deleting = deleteUser(db, owner.userId);
    await new Promise((resolve) => setTimeout(resolve, 200));
    sync.release();

    await expect(sync.committed).resolves.toBeUndefined();
    await expect(deleting).resolves.toBeUndefined();
    expect(await gamesOf(owner.userId)).toEqual([]);
    expect(await db.select().from(users).where(eq(users.id, owner.userId))).toEqual([]);
  });

  it("deleting a user waiting on an in-flight import deletes that game too", async () => {
    const owner = await anAccount();
    const insert = heldInsert(owner);
    await insert.didInsert;

    const deleting = deleteUser(db, owner.userId);
    await new Promise((resolve) => setTimeout(resolve, 200));
    insert.release();
    await insert.committed;
    await deleting;

    expect(await gamesOf(owner.userId)).toEqual([]);
  });

  it("a sync write after the user is deleted fails instead of writing", async () => {
    const owner = await anAccount();
    await deleteUser(db, owner.userId);

    await expect(saveGames(otherDb, [lateGame], owner)).rejects.toThrow();
    expect(await gamesOf(owner.userId)).toEqual([]);
  });
});
