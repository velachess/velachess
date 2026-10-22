import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import type { ApiEnv } from "../server.ts";
import { defaultHook } from "../validation.ts";

const checkSchema = z.object({
  status: z.enum(["ok", "failed", "timeout"]),
  latencyMs: z.number().int().nonnegative(),
});

const readinessSchema = z.object({
  status: z.enum(["ready", "not_ready"]),
  checks: z.object({
    database: checkSchema,
    migrations: checkSchema,
    queue: checkSchema,
  }),
});

export type Readiness = z.infer<typeof readinessSchema>;

export interface HealthDeps {
  ready: () => Promise<Readiness>;
}

const liveRoute = createRoute({
  method: "get",
  path: "/live",
  summary: "Liveness probe: the process is up; no dependency is checked",
  responses: {
    200: {
      description: "Process is up",
      content: {
        "application/json": { schema: z.object({ status: z.literal("ok") }) },
      },
    },
  },
});

const readyRoute = createRoute({
  method: "get",
  path: "/ready",
  summary: "Readiness probe: Postgres, migrations and the queue",
  responses: {
    200: {
      description: "Every check passed",
      content: { "application/json": { schema: readinessSchema } },
    },
    503: {
      description: "At least one check failed or timed out",
      content: { "application/json": { schema: readinessSchema } },
    },
  },
});

export function healthRoutes(deps: HealthDeps) {
  return new OpenAPIHono<ApiEnv>({ defaultHook })
    .openapi(liveRoute, (c) => c.json({ status: "ok" }, 200))
    .openapi(readyRoute, async (c) => {
      const readiness = await deps.ready();
      if (readiness.status === "ready") return c.json(readiness, 200);
      return c.json(readiness, 503);
    });
}
