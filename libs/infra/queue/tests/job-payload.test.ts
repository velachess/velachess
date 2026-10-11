// @vitest-environment node
/**
 * The consume-boundary contract. `boss.work<T>`'s generic is an assertion
 * and nothing more, so a consumer parses before it hands a payload to a
 * slice — `pgboss.job.data` is `jsonb` holding whatever an older deploy,
 * the topology warm-up, or a hand-inserted row left there.
 */
import { describe, expect, it } from "vitest";

import { analysisJobDataSchema, syncJobDataSchema } from "@velachess/infra-queue";

const NIL = "00000000-0000-0000-0000-000000000000";

describe("job payload schemas", () => {
  it("accept what the producers actually send", () => {
    expect(analysisJobDataSchema.safeParse({ gameId: NIL }).success).toBe(true);
    expect(syncJobDataSchema.safeParse({ syncJobId: NIL, accountId: NIL }).success).toBe(
      true,
    );
  });

  it("accept the topology warm-up payload", () => {
    // `ensureQueues` sends one real job per queue to warm pg-boss's send
    // path, then deletes it. It is deliverable in between, and it used to
    // be `{}` — the one message in the system its own consumer rejects.
    const warmUp = { gameId: NIL, syncJobId: NIL, accountId: NIL };

    expect(analysisJobDataSchema.safeParse(warmUp).success).toBe(true);
    expect(syncJobDataSchema.safeParse(warmUp).success).toBe(true);
  });

  it("reject a payload that would reach a slice as `undefined`", () => {
    for (const data of [{}, null, undefined, 5, "a-game", [], { gameId: 5 }]) {
      expect(analysisJobDataSchema.safeParse(data).success).toBe(false);
    }
    for (const data of [{}, null, undefined, 5, [], { syncJobId: NIL }]) {
      expect(syncJobDataSchema.safeParse(data).success).toBe(false);
    }
  });

  it("does not confuse the two queues' payloads", () => {
    expect(
      analysisJobDataSchema.safeParse({ syncJobId: NIL, accountId: NIL }).success,
    ).toBe(false);
    expect(syncJobDataSchema.safeParse({ gameId: NIL }).success).toBe(false);
  });
});
