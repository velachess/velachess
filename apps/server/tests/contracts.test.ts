// @vitest-environment node
/**
 * Drift guards for the mirrors `routes-no-direct-infra` and
 * `routes-no-module-internals` mandate: a route cannot import
 * `libs/infra/*` or a business module's slice internals, so it keeps a
 * hand-written copy of a shared vocabulary instead. This file runs from
 * `apps/server/tests/`, which both rules exempt, so it can import the real
 * source of truth and check the route's copy against it directly.
 */
import {
  accountPlatformSchema,
  gameSourceSchema,
  perspectiveSchema,
  resultSchema,
} from "@velachess/infra-platforms";
import { syncJobErrorEnum, syncJobStatusEnum } from "@velachess/infra-db";
import { describe, expect, it } from "vitest";

import type { GradedPly } from "@velachess/analysis";

import {
  ACCOUNT_PLATFORM,
  SYNC_JOB_ERROR as ACCOUNT_SYNC_JOB_ERROR,
} from "../src/routes/accounts.ts";
import {
  GAME_PERSPECTIVE,
  GAME_RESULT,
  GAME_SOURCE,
  gradedPlySchema,
  type GradedPlyWire,
} from "../src/routes/games.ts";
import { SYNC_JOB_ERROR, SYNC_JOB_STATUS } from "../src/routes/syncs.ts";

describe("route vocabulary mirrors", () => {
  it("games.ts matches @velachess/infra-platforms", () => {
    expect(GAME_SOURCE).toEqual(gameSourceSchema.options);
    expect(GAME_PERSPECTIVE).toEqual(perspectiveSchema.options);
    expect(GAME_RESULT).toEqual(resultSchema.options);
  });

  it("accounts.ts matches @velachess/infra-platforms and the sync_job_error enum", () => {
    expect(ACCOUNT_PLATFORM).toEqual(accountPlatformSchema.options);
    expect(ACCOUNT_SYNC_JOB_ERROR).toEqual(syncJobErrorEnum.enumValues);
  });

  it("syncs.ts matches the sync_job_status and sync_job_error enums", () => {
    expect(SYNC_JOB_STATUS).toEqual(syncJobStatusEnum.enumValues);
    expect(SYNC_JOB_ERROR).toEqual(syncJobErrorEnum.enumValues);
  });
});

// `exactOptionalPropertyTypes` makes zod's inferred `cp?: number | undefined`
// a one-way match against `WhitePovScore`'s plain `cp?: number`, so only this
// direction type-checks; `it.each` over the schema's own keys below catches a
// field dropped from `gradedPlySchema` that this alone would miss.
const toWire: GradedPlyWire = {} as GradedPly;
void toWire;

it("gradedPlySchema declares every GradedPly field", () => {
  const fields: Record<keyof GradedPly, true> = {
    ply: true,
    fen: true,
    san: true,
    evalBefore: true,
    evalAfter: true,
    bestMove: true,
    category: true,
    winChanceLoss: true,
  };
  expect(Object.keys(gradedPlySchema.shape).toSorted()).toEqual(
    Object.keys(fields).toSorted(),
  );
});
