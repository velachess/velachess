/**
 * [SERVER] — the HTTP app, assembled from injected deps (bootstrapping lives
 * in main.ts, so tests build the same app over PGlite). AppType is a type-only
 * export — importing it pulls zero runtime code.
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { logger } from "@velachess/logger";

import type { ApiDeps } from "./deps.ts";
import { sessionMiddleware } from "./middleware/session.ts";
import { openApiSpec } from "./openapi.ts";
import { accountsRoutes } from "./routes/accounts.ts";
import { deviationsRoutes } from "./routes/deviations.ts";
import { gamesRoutes } from "./routes/games.ts";
import { repertoiresRoutes } from "./routes/repertoires.ts";
import { drillRoutes } from "./routes/drill.ts";
import { overviewRoutes } from "./routes/overview.ts";
import { insightsRoutes } from "./routes/insights.ts";

const apiLogger = logger.child({ component: "api" });

export interface ApiEnv {
  Variables: {
    userId: string;
  };
}

export function createApp(deps: ApiDeps) {
  const app = new Hono<ApiEnv>()
    // System routes first — liveness and documentation answer even when
    // the database is down; identity never touches them.
    .get("/health", (c) => c.json({ ok: true }))
    .get("/openapi.json", (c) => c.json(openApiSpec))
    // Better Auth owns everything under /auth/* — sign-in, sign-out,
    // session, sign-up. Mounted before the session gate because logging
    // in is, definitionally, done without a session. The handler shape is
    // the official Hono integration: forward the raw Request.
    .all("/auth/*", (c) => deps.auth.handler(c.req.raw))
    .use("*", sessionMiddleware(deps.auth))
    .route("/accounts", accountsRoutes(deps))
    .route("/games", gamesRoutes(deps))
    .route("/deviations", deviationsRoutes(deps))
    .route("/repertoires", repertoiresRoutes(deps))
    .route("/drill", drillRoutes(deps))
    .route("/overview", overviewRoutes(deps))
    .route("/insights", insightsRoutes(deps));

  // One JSON error contract everywhere. HTTPException is hono's own
  // "stop this request" signal (middleware throws it, a handler may):
  // its status and message become the same `{ error }` shape the
  // handlers speak, so a thrown rejection and a returned one are
  // indistinguishable on the wire. Everything else is a defect: logged
  // with the request context and answered as an opaque 500 — internals
  // never leak into a response body.
  app.notFound((c) => c.json({ error: "not found" }, 404));
  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return c.json({ error: error.message }, error.status);
    }
    apiLogger.error(
      { error, method: c.req.method, path: c.req.path },
      "unhandled api error",
    );
    return c.json({ error: "internal error" }, 500);
  });

  return app;
}

/** Type-only contract for clients (hono/client). Never import the value. */
export type AppType = ReturnType<typeof createApp>;
