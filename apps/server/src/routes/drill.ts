import { Hono } from "hono";
import { z } from "zod";

import {
  countDrillQueue,
  getNextDrillForUser,
  submitAnswer,
  type CountDrillQueueDeps,
  type GetNextDrillDeps,
  type SubmitAnswerDeps,
} from "@velachess/drills";

import type { ApiEnv } from "../server.ts";
import { validateJson, validateQuery } from "../validation.ts";

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
const scopeSchema = z.object({
  source: z
    .enum(["repertoire-deviation", "engine-blunder", "repertoire-line"])
    .optional(),
  repertoire: z.string().uuid().optional(),
  chapter: z.string().uuid().optional(),
});

function scopeOf(query: z.infer<typeof scopeSchema>) {
  return {
    ...(query.source ? { origin: query.source } : {}),
    ...(query.repertoire ? { repertoireId: query.repertoire } : {}),
    ...(query.chapter ? { chapterId: query.chapter } : {}),
  };
}

/** Each route's own narrow deps, composed separately — the three don't
 * share a shape. See apps/server/src/composition/drills.ts. */
export interface DrillRouteDeps {
  queue: CountDrillQueueDeps;
  next: GetNextDrillDeps;
  answer: SubmitAnswerDeps;
}

export function drillRoutes(deps: DrillRouteDeps) {
  return (
    new Hono<ApiEnv>()
      /**
       * What is waiting, before anything is served.
       *
       * `/next` hands over one exercise, which is enough to practise and
       * not enough to decide whether to start. The screen needs the shape
       * of the pile to render a choice instead of a board.
       */
      .get("/queue", validateQuery(scopeSchema), async (c) => {
        const scope = scopeOf(c.req.valid("query"));
        return c.json(
          await countDrillQueue(deps.queue, c.get("userId"), new Date(), scope),
        );
      })
      .get("/next", validateQuery(scopeSchema), async (c) => {
        const scope = scopeOf(c.req.valid("query"));
        const item = await getNextDrillForUser(
          deps.next,
          c.get("userId"),
          new Date(),
          scope,
        );
        if (!item) return c.body(null, 204);
        return c.json(item);
      })
      .post("/answer", validateJson(answerSchema), async (c) => {
        const { exerciseId, san, responseTimeMs } = c.req.valid("json");
        const outcome = await submitAnswer(deps.answer, c.get("userId"), {
          exerciseId,
          san,
          ...(responseTimeMs !== undefined ? { responseTimeMs } : {}),
        });
        if (!outcome) return c.json({ error: "exercise not found" }, 404);
        return c.json(outcome);
      })
  );
}
