import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import {
  countDrillQueue,
  getNextDrillForUser,
  submitAnswer,
  type CountDrillQueueDeps,
  type GetNextDrillDeps,
  type SubmitAnswerDeps,
} from "@velachess/drills";

import type { ApiEnv } from "../server.ts";
import { defaultHook, errorResponseSchema } from "../validation.ts";

const answerSchema = z.object({
  exerciseId: z.string().uuid(),
  san: z.string().min(1),
  responseTimeMs: z.number().int().positive().optional(),
});

/**
 * One scope grammar for `/queue` and `/next`: the same queue, one slice
 * of it. `source` narrows by what put an exercise there, `repertoire`/
 * `chapter` by whose preparation it belongs to — a chapter's Train
 * button and an insight's CTA both land here instead of on the whole
 * pile.
 */
const originSchema = z.enum([
  "repertoire-deviation",
  "engine-blunder",
  "repertoire-line",
]);
const scopeSchema = z.object({
  source: originSchema.optional().describe("Narrow to one origin."),
  repertoire: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Narrow to one repertoire's preparation — its chapters' line drills and the deviations judged against it.",
    ),
  chapter: z.string().uuid().optional().describe("Narrow to one chapter."),
});

function scopeOf(query: z.infer<typeof scopeSchema>) {
  return {
    ...(query.source ? { origin: query.source } : {}),
    ...(query.repertoire ? { repertoireId: query.repertoire } : {}),
    ...(query.chapter ? { chapterId: query.chapter } : {}),
  };
}

/** Mirrors `@velachess/infra-db`'s `DrillQueueCounts`. */
const drillQueueCountsSchema = z.object({
  due: z.number().int().describe("Scheduled and past due."),
  fresh: z.number().int().describe("Seeded but never scheduled — no card yet."),
  byOrigin: z
    .object({
      "repertoire-deviation": z.number().int(),
      "engine-blunder": z.number().int(),
      "repertoire-line": z.number().int(),
    })
    .describe(
      "The same waiting drills split by what put them there. An exercise carrying both origins counts in both, so these do not sum to due + fresh — they are two piles, not slices of one bar.",
    ),
});

const drillQueueRoute = createRoute({
  method: "get",
  path: "/queue",
  summary: "What is waiting to be drilled, before anything is served",
  description:
    "One scope grammar with /drill/next: the same queue, one slice of it, so a chapter's Train button and an insight's CTA count exactly what they will serve.",
  request: { query: scopeSchema },
  responses: {
    200: {
      description: "Counts the drill screen renders a choice from",
      content: { "application/json": { schema: drillQueueCountsSchema } },
    },
  },
});

/** Mirrors `@velachess/scheduler`'s `Grade` — the FSRS review grades. */
const gradeSchema = z.enum(["again", "hard", "good", "easy"]);
const previewSchema = z.object({
  due: z.string().describe("ISO date-time of the next review under this grade."),
  intervalDays: z.number(),
});

/** Mirrors `@velachess/infra-db`'s `DrillContext`. */
const drillContextSchema = z.object({
  origin: originSchema,
  playedSan: z
    .string()
    .nullable()
    .describe("The move you played, to contrast with the answer."),
  label: z
    .string()
    .nullable()
    .describe(
      "Where it came from, in words: a chapter of your book, or the game and move number.",
    ),
});

/** Mirrors `@velachess/drills`' `ReviewItem` — `previews`' `due` and
 * `context` travel as ISO text / a plain nullable object on the wire. */
const reviewItemSchema = z.object({
  exerciseId: z.string().uuid(),
  fen: z.string().describe("Playable FEN for the board"),
  previews: z.object({
    again: previewSchema,
    hard: previewSchema,
    good: previewSchema,
    easy: previewSchema,
  }),
  phase: z.enum(["due", "new"]),
  context: drillContextSchema
    .nullable()
    .describe(
      "Why the position is being asked and what it can say about itself. An exercise holding both origins is explained by the repertoire, because that is what expectedSans holds. Null when the provenance is missing.",
    ),
});

const nextDrillRoute = createRoute({
  method: "get",
  path: "/next",
  summary: "Next drill: oldest due card, else a new exercise",
  description: "Optionally scoped — the same queue /drill/queue counts, one slice of it.",
  request: { query: scopeSchema },
  responses: {
    200: {
      description: "The drill to serve",
      content: { "application/json": { schema: reviewItemSchema } },
    },
    204: { description: "Nothing to drill" },
  },
});

/** Mirrors `@velachess/drills`' `AnswerOutcome` — `nextDue` travels as
 * ISO text on the wire, not a `Date`. */
const answerOutcomeSchema = z.object({
  correct: z.boolean(),
  grade: gradeSchema,
  expectedSans: z.array(z.string()),
  nextDue: z.string(),
});

const submitAnswerRoute = createRoute({
  method: "post",
  path: "/answer",
  summary: "Answer an exercise; grades it and schedules the next review",
  request: {
    body: { content: { "application/json": { schema: answerSchema } } },
  },
  responses: {
    200: {
      description: "Grade and next due date",
      content: { "application/json": { schema: answerOutcomeSchema } },
    },
    404: {
      description: "Unknown exercise",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

/** Each route's own narrow deps, composed separately — the three don't
 * share a shape. See apps/server/src/composition/drills.ts. */
export interface DrillRouteDeps {
  queue: CountDrillQueueDeps;
  next: GetNextDrillDeps;
  answer: SubmitAnswerDeps;
}

export function drillRoutes(deps: DrillRouteDeps) {
  return (
    new OpenAPIHono<ApiEnv>({ defaultHook })
      /**
       * What is waiting, before anything is served.
       *
       * `/next` hands over one exercise, which is enough to practise and
       * not enough to decide whether to start. The screen needs the shape
       * of the pile to render a choice instead of a board.
       */
      .openapi(drillQueueRoute, async (c) => {
        const scope = scopeOf(c.req.valid("query"));
        return c.json(
          await countDrillQueue(deps.queue, c.get("userId"), new Date(), scope),
          200,
        );
      })
      .openapi(nextDrillRoute, async (c) => {
        const scope = scopeOf(c.req.valid("query"));
        const item = await getNextDrillForUser(
          deps.next,
          c.get("userId"),
          new Date(),
          scope,
        );
        if (!item) return c.body(null, 204);
        return c.json(
          {
            ...item,
            previews: {
              again: {
                due: item.previews.again.due.toISOString(),
                intervalDays: item.previews.again.intervalDays,
              },
              hard: {
                due: item.previews.hard.due.toISOString(),
                intervalDays: item.previews.hard.intervalDays,
              },
              good: {
                due: item.previews.good.due.toISOString(),
                intervalDays: item.previews.good.intervalDays,
              },
              easy: {
                due: item.previews.easy.due.toISOString(),
                intervalDays: item.previews.easy.intervalDays,
              },
            },
          },
          200,
        );
      })
      .openapi(submitAnswerRoute, async (c) => {
        const { exerciseId, san, responseTimeMs } = c.req.valid("json");
        const outcome = await submitAnswer(deps.answer, c.get("userId"), {
          exerciseId,
          san,
          ...(responseTimeMs !== undefined ? { responseTimeMs } : {}),
        });
        if (!outcome) return c.json({ error: "exercise not found" }, 404);
        return c.json(
          Object.assign({}, outcome, { nextDue: outcome.nextDue.toISOString() }),
          200,
        );
      })
  );
}
