/**
 * The shared request/response contract every `@hono/zod-openapi` route
 * builds on: the `{id}`/`{repertoireId, chapterId}` path params, the
 * `{ error, details? }` error body, and the one `defaultHook` that
 * produces it for every failed validation.
 */

import type { Hook } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";

/** Shared `{id}` path param for every migrated `/:id`-shaped route. */
export const idParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

/** Shared two-id path param for `/{repertoireId}/chapters/{chapterId}`. */
export const chapterParamsSchema = z.object({
  repertoireId: z
    .string()
    .uuid()
    .openapi({ param: { name: "repertoireId", in: "path" } }),
  chapterId: z
    .string()
    .uuid()
    .openapi({ param: { name: "chapterId", in: "path" } }),
});

/** The `{ error, details? }` body every migrated route's error branches document. */
export const errorResponseSchema = z.object({
  error: z.string(),
  details: z.array(z.string()).optional(),
});

/**
 * One hook for every `OpenAPIHono` instance, answering the exact same
 * `{ error, details? }` shape regardless of what failed: a malformed path
 * param answers `{ error: "invalid id" }` with no `details` (there is
 * only ever one thing wrong with a uuid param), a bad body/query answers
 * `{ error, details }` with one string per issue.
 */
// `any` for the Env position matches `@hono/zod-openapi`'s own
// `OpenAPIHonoOptions<E>['defaultHook']` shape (`Hook<any, E, any, any>`)
// — one hook value must be assignable regardless of which app's `Env` it's
// passed to, and this hook never reads an env-specific context variable.
export const defaultHook: Hook<unknown, any, string, Response | undefined> = (
  result,
  c,
) => {
  if (result.success) return undefined;
  if (result.target === "param") return c.json({ error: "invalid id" }, 400);
  const label = result.target === "json" ? "invalid body" : "invalid query";
  return c.json(
    {
      error: label,
      details: result.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    },
    400,
  );
};
