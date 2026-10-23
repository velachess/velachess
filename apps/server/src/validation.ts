import type { Hook } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";

export const idParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

export const errorResponseSchema = z.object({
  error: z.string(),
  details: z.array(z.string()).optional(),
});

/**
 * `@hono/zod-openapi` validates requests only, so a response schema that
 * says `z.string()` while the handler calls `.toISOString()` by hand is two
 * declarations that can disagree and both typecheck. These make the schema
 * perform the conversion it documents.
 *
 * Used through `.extend()` on the documented schema, so the non-date fields
 * cannot drift and unnamed keys are stripped rather than shipped. Parsing
 * on the way out is affordable only because every response using it is
 * bounded to one row or one page.
 */
export const wireDate = z.date().transform((value) => value.toISOString());

export const wireDateOrNull = z
  .date()
  .nullable()
  .transform((value) => value?.toISOString() ?? null);

// `any` in the Env position matches `@hono/zod-openapi`'s own
// `OpenAPIHonoOptions<E>['defaultHook']` shape: one hook value must be
// assignable whichever app's `Env` it is passed to, and this hook never
// reads an env-specific context variable.
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
