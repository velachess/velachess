/**
 * Validation with one error contract. Every failed validation — body or
 * path param — answers the `{ error }` shape the OpenAPI document
 * promises, instead of zod-validator's default zod dump.
 */

import { zValidator } from "@hono/zod-validator";
import type { z } from "zod";
import { z as zod } from "zod";

const idParamSchema = zod.object({ id: zod.string().uuid() });

export function validateJson<T extends z.ZodType>(schema: T) {
  return zValidator("json", schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "invalid body",
          details: result.error.issues.map(
            (issue) => `${issue.path.join(".")}: ${issue.message}`,
          ),
        },
        400,
      );
    }
  });
}

export function validateQuery<T extends z.ZodType>(schema: T) {
  return zValidator("query", schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "invalid query",
          details: result.error.issues.map(
            (issue) => `${issue.path.join(".")}: ${issue.message}`,
          ),
        },
        400,
      );
    }
  });
}

/** For every `/:id` route — a malformed id is a 400, not a db error. */
export const validateIdParam = zValidator("param", idParamSchema, (result, c) => {
  if (!result.success) return c.json({ error: "invalid id" }, 400);
});

const chapterParamsSchema = zod.object({
  repertoireId: zod.string().uuid(),
  chapterId: zod.string().uuid(),
});

/** For `/:repertoireId/chapters/:chapterId` — same contract, two ids. */
export const validateChapterParams = zValidator(
  "param",
  chapterParamsSchema,
  (result, c) => {
    if (!result.success) return c.json({ error: "invalid id" }, 400);
  },
);
