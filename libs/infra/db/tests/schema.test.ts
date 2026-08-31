import type { GradedPly } from "@velachess/analysis";
import { gameSourceSchema } from "@velachess/infra-platforms";
import { describe, expect, it } from "vitest";

import { gameSourceEnum } from "@velachess/infra-db";
import type { StoredGradedPly } from "../schema.ts";

describe("gameSourceEnum", () => {
  it("matches packages/ingest's gameSourceSchema exactly", () => {
    expect(gameSourceEnum.enumValues).toEqual(gameSourceSchema.options);
  });
});

// Drift guard: the schema's structural mirror must stay assignable from the
// real GradedPly — both directions, checked at typecheck time. Lives here,
// not in production code, because a type-only import of a business module
// from infra is still an infra-to-modules edge that production code may
// never take — this file's own path exempts it from that boundary.
const toStoredDriftCheck: StoredGradedPly = {} as GradedPly;
const fromStoredDriftCheck: GradedPly = {} as StoredGradedPly;
void toStoredDriftCheck;
void fromStoredDriftCheck;
