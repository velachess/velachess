import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { listInsights, type GetInsightsDeps } from "@velachess/insights";

import type { ApiEnv } from "../server.ts";
import { defaultHook } from "../validation.ts";

const coverageSchema = z.object({
  gamesConsidered: z.number().int(),
  deeplyAnalysedGames: z.number().int(),
  coverage: z
    .number()
    .describe("deeplyAnalysedGames / gamesConsidered; 0 over an empty history."),
});

/**
 * `Finding` is a discriminated union of six source shapes
 * (`libs/insights/get-insights/*.ts`) — modeled here field-for-field
 * (not loosely) because `apps/web`'s `finding-views.tsx` narrows on
 * `kind` and reads kind-specific `evidence` fields; a loose
 * `z.record(...)` evidence shape defeats that narrowing entirely (caught
 * by the RPC typecheck gate).
 */
const findingSubjectSchema = z.object({
  repertoireId: z.string().uuid(),
  name: z.string(),
  color: z.enum(["white", "black"]),
});

const adherenceEvidenceSchema = z.object({
  inBookGames: z.number().int(),
  inBookWinRate: z.number(),
  outOfBookGames: z.number().int(),
  outOfBookWinRate: z.number(),
  judgedGames: z.number().int(),
  adherenceRate: z.number(),
  averagePrepDepth: z.number(),
});

const adherenceFindingBase = z.object({
  id: z.string().describe("Stable across runs for unchanged data."),
  section: z.literal("openings"),
  scope: z.enum(["all-games", "analysed-games"]),
  subject: findingSubjectSchema.describe(
    "Adherence kinds only: the repertoire the finding is about.",
  ),
  evidence: adherenceEvidenceSchema,
  weight: z.number(),
});
const bookAdvantageFindingSchema = adherenceFindingBase.extend({
  kind: z.literal("book-advantage"),
});
const bookDisadvantageFindingSchema = adherenceFindingBase.extend({
  kind: z.literal("book-disadvantage"),
});

const openingWeaknessEvidenceSchema = z.object({
  openingName: z.string(),
  openingEco: z.string().nullable(),
  games: z.number().int(),
  winRate: z.number(),
  baselineWinRate: z.number(),
  baselineGames: z.number().int(),
});
const openingWeaknessFindingSchema = z.object({
  id: z.string(),
  kind: z.literal("opening-weakness"),
  section: z.literal("openings"),
  scope: z.enum(["all-games", "analysed-games"]),
  evidence: openingWeaknessEvidenceSchema,
  weight: z.number(),
});

const trendWindowSchema = z.object({
  games: z.number().int(),
  decided: z.number().int(),
  winRate: z.number(),
  averageRating: z.number().nullable(),
  analysedGames: z.number().int(),
  mistakesPerGame: z.number().nullable(),
  blundersPerGame: z.number().nullable(),
});
const performanceTrendEvidenceSchema = z.object({
  windowSize: z.number().int(),
  latest: trendWindowSchema,
  previous: trendWindowSchema,
});
const performanceTrendFindingSchema = z.object({
  id: z.string(),
  kind: z.literal("performance-trend"),
  section: z.literal("performance"),
  scope: z.enum(["all-games", "analysed-games"]),
  evidence: performanceTrendEvidenceSchema,
  weight: z.number(),
});

const gamePhaseSchema = z.enum(["opening", "middlegame", "endgame"]);
/** All three phases, floors applied — the comparison in full. */
const phaseBreakdownSchema = z.object({
  phase: gamePhaseSchema,
  errors: z.number().int(),
  ownMoves: z.number().int(),
  rate: z
    .number()
    .nullable()
    .describe("errors / ownMoves; null under the exposure floor."),
});
const phasePerformanceEvidenceSchema = z.object({
  phase: gamePhaseSchema.describe("The phase the finding is about."),
  errorRate: z.number(),
  overallErrorRate: z.number(),
  ownMovesInPhase: z.number().int(),
  totalOwnMoves: z.number().int(),
  gamesAnalysed: z.number().int(),
  byPhase: z.array(phaseBreakdownSchema),
});
const phasePerformanceFindingSchema = z.object({
  id: z.string(),
  kind: z.literal("phase-performance"),
  section: z.literal("phases"),
  scope: z.enum(["all-games", "analysed-games"]),
  evidence: phasePerformanceEvidenceSchema,
  weight: z.number(),
});

const recurringMistakeEvidenceSchema = z.object({
  phase: gamePhaseSchema,
  category: z.enum(["mistake", "blunder"]),
  mistakes: z.number().int(),
  ownMovesInPhase: z.number().int(),
  rate: z.number(),
  overallRate: z.number(),
  gamesAnalysed: z.number().int(),
  topOpening: z.object({ name: z.string(), mistakes: z.number().int() }).nullable(),
});
const recurringMistakeFindingSchema = z.object({
  id: z.string(),
  kind: z.literal("recurring-mistake"),
  section: z.literal("training"),
  scope: z.enum(["all-games", "analysed-games"]),
  evidence: recurringMistakeEvidenceSchema,
  weight: z.number(),
});

const winningPositionBlundersEvidenceSchema = z.object({
  throws: z.number().int(),
  winningPositions: z.number().int(),
  rate: z.number(),
  gamesAffected: z.number().int(),
  gamesAnalysed: z.number().int(),
  worst: z
    .object({
      gameId: z.string().uuid(),
      ply: z.number().int(),
      winChanceLoss: z.number(),
    })
    .nullable(),
});
const winningPositionBlundersFindingSchema = z.object({
  id: z.string(),
  kind: z.literal("winning-position-blunders"),
  section: z.literal("training"),
  scope: z.enum(["all-games", "analysed-games"]),
  evidence: winningPositionBlundersEvidenceSchema,
  weight: z.number(),
});

const findingSchema = z.discriminatedUnion("kind", [
  bookAdvantageFindingSchema,
  bookDisadvantageFindingSchema,
  openingWeaknessFindingSchema,
  performanceTrendFindingSchema,
  phasePerformanceFindingSchema,
  recurringMistakeFindingSchema,
  winningPositionBlundersFindingSchema,
]);

const insightsReportSchema = z.object({
  coverage: coverageSchema,
  findings: z.array(findingSchema),
});

const listInsightsRoute = createRoute({
  method: "get",
  path: "/",
  summary: "What holds across games, ranked",
  description:
    "Findings rather than tables: each one names a comparison worth making and carries the numbers it was drawn from, biggest measured effect first. Six sources feed one globally ranked list. Empty `findings` is a valid answer — every source stays silent below its evidence floor — and the envelope's `coverage` says what dataset that silence was drawn from.",
  responses: {
    200: {
      description: "The dataset's coverage, and findings most measured first",
      content: { "application/json": { schema: insightsReportSchema } },
    },
  },
});

/**
 * Cross-game patterns a single game report can't surface. Returns ranked
 * findings, not raw tables — an empty array is a valid, common answer.
 */
export function insightsRoutes(deps: GetInsightsDeps) {
  return new OpenAPIHono<ApiEnv>({ defaultHook }).openapi(listInsightsRoute, async (c) =>
    c.json(await listInsights(deps, c.get("userId")), 200),
  );
}
