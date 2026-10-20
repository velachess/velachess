/**
 * The shared request/response contract every `@hono/zod-openapi` route
 * builds on: the `{id}` path param, the `{ error, details? }` error body,
 * and the one `defaultHook` that produces it for every failed validation.
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

/** The `{ error, details? }` body every migrated route's error branches document. */
export const errorResponseSchema = z.object({
  error: z.string(),
  details: z.array(z.string()).optional(),
});

/**
 * A timestamp on its way out.
 *
 * `@hono/zod-openapi` validates requests only — `defaultHook` below fires
 * on `param`, `json` and `query`, never on a response — so a response
 * schema that merely *says* `z.string()` while the handler writes
 * `.toISOString()` by hand is two declarations that can disagree and both
 * typecheck (`Object.assign` widens). These make the schema do the
 * conversion it documents, so there is one declaration per field.
 *
 * Used through `.extend()` on the documented response schema, which stays
 * the one OpenAPI renders: the non-date fields cannot drift because the
 * serializer is built from the real thing, and keys the contract does not
 * name are stripped rather than shipped.
 *
 * Parsing on the way out costs work, which is affordable here only
 * because every response that uses it is bounded — one row, or one page
 * of at most `MAX_PAGE_SIZE`.
 */
export const wireDate = z.date().transform((value) => value.toISOString());

/** `wireDate` for a nullable column — absent stays absent. */
export const wireDateOrNull = z
  .date()
  .nullable()
  .transform((value) => value?.toISOString() ?? null);

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
// oxlint-disable-next-line typescript/no-explicit-any -- mirrors the upstream Hook<any, E, any, any> signature
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
