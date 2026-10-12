// @vitest-environment node
/**
 * The consume-boundary contract. `boss.work<T>`'s generic is an assertion
 * and nothing more, so the worker parses before it hands a payload to a
 * slice — `pgboss.job.data` is `jsonb` holding whatever an older deploy,
 * the topology warm-up, or a hand-inserted row left there. The sync queue
 * carries no payload: its job id is the sync job's id.
 */
import { describe, expect, it } from "vitest";

import { analysisJobDataSchema } from "@velachess/infra-queue";

const NIL = "00000000-0000-0000-0000-000000000000";

describe("job payload schemas", () => {
  it("accept what the producers actually send", () => {
    expect(analysisJobDataSchema.safeParse({ gameId: NIL }).success).toBe(true);
  });

  it("accept the topology warm-up payload", () => {
    // `ensureQueues` sends one real job per queue to warm pg-boss's send
    // path, then deletes it. It is deliverable in between, and it used to
    // be `{}` — the one message in the system its own consumer rejects.
    expect(analysisJobDataSchema.safeParse({ gameId: NIL }).success).toBe(true);
  });

  it("reject a payload that would reach a slice as `undefined`", () => {
    for (const data of [{}, null, undefined, 5, "a-game", [], { gameId: 5 }]) {
      expect(analysisJobDataSchema.safeParse(data).success).toBe(false);
    }
  });
});
