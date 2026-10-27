// @vitest-environment node
import { parseResponse } from "hono/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { abandonSyncJob, createSyncJob } from "@velachess/infra-db";

import { createApiHarness, type ApiHarness, type AuthedApp } from "./harness.ts";

let harness: ApiHarness;

beforeAll(async () => {
  harness = await createApiHarness();
});

afterAll(() => harness.close());

/** The stream's text until it has been quiet for a moment, or `ms` passed. */
async function readSome(response: Response, ms = 1500) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + ms;
  let text = "";
  while (Date.now() < deadline) {
    const next = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined }>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), 300),
      ),
    ]);
    if (next.done) break;
    text += decoder.decode(next.value, { stream: true });
  }
  await reader.cancel().catch(() => {});
  return text;
}

async function connectLooper(app: AuthedApp) {
  const created = await app.api.accounts.$post({
    json: { platform: "chess_com", username: "looper" },
  });
  expect(created.status).toBe(201);
  if (created.status !== 201) throw new Error("unreachable");
  const account = await created.json();
  if (!account.syncId) throw new Error("expected a first sync on a fresh connect");
  return { ...account, syncId: account.syncId };
}

describe("GET /syncs/events", () => {
  it("announces the owner's sync once it lands, with the games already readable", async () => {
    const owner = (await harness.signUp("lands@sync-events.test")).app;
    const events = await owner.request("/syncs/events");
    expect(events.status).toBe(200);
    expect(events.headers.get("content-type")).toContain("text/event-stream");

    const account = await connectLooper(owner);
    const text = await (async () => {
      await harness.runSync(account.syncId);
      return readSome(events);
    })();

    expect(text).toContain("event: sync.completed");
    expect(text).toContain(`id: ${account.syncId}`);
    const frame: { syncId: string; accountId: string; gamesInserted: number } =
      JSON.parse(text.split("data: ")[1]!.split("\n")[0]!);
    expect(frame).toMatchObject({ syncId: account.syncId, accountId: account.id });
    expect(frame.gamesInserted).toBeGreaterThan(0);
    // Delivered on commit: the library a browser refetches on this frame is
    // already the synced one.
    const library = await parseResponse(owner.api.games.$get({ query: {} }));
    expect(library.total).toBe(frame.gamesInserted);
  });

  it("announces a job the api had to abandon as failed", async () => {
    const { app: owner, userId } = await harness.signUp("abandoned@sync-events.test");
    const account = await connectLooper(owner);
    await harness.runSync(account.syncId);
    const job = (await createSyncJob(harness.db, {
      userId,
      accountId: account.id,
      trigger: "manual",
    }))!;
    const events = await owner.request("/syncs/events");

    await abandonSyncJob(harness.db, job.id);
    const text = await readSome(events);

    expect(text).toContain("event: sync.failed");
    expect(text).toContain(`id: ${job.id}`);
    expect(text).not.toContain("sync.completed");
  });

  it("tells a stranger nothing of another user's sync, while announcing their own", async () => {
    const alice = (await harness.signUp("alice@sync-events.test")).app;
    const bob = (await harness.signUp("bob@sync-events.test")).app;
    const aliceAccount = await connectLooper(alice);
    const bobAccount = await connectLooper(bob);
    const bobEvents = await bob.request("/syncs/events");

    await harness.runSync(aliceAccount.syncId);
    await harness.runSync(bobAccount.syncId);
    const text = await readSome(bobEvents);

    // The positive half is what makes the negative one evidence: a stream
    // that announced nothing at all would pass it too.
    expect(text).toContain("event: sync.completed");
    expect(text).toContain(`id: ${bobAccount.syncId}`);
    expect(text).not.toContain(aliceAccount.syncId);
    expect(text).not.toContain(aliceAccount.id);
  });

  it("ends when the client leaves", async () => {
    const owner = (await harness.signUp("leaves@sync-events.test")).app;
    const controller = new AbortController();
    const events = await owner.request("/syncs/events", { signal: controller.signal });
    const reading = events.body!.getReader().read();
    controller.abort();
    // The loop let go and the stream closed — not a frame, not a hang.
    await expect(reading).resolves.toMatchObject({ done: true });
  });
});
