/**
 * [SERVER] — the HTTP app, assembled from injected deps (bootstrapping lives
 * in main.ts, so tests build the same app over PGlite). AppType is a type-only
 * export — importing it pulls zero runtime code.
 */

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { except } from "hono/combine";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";

import { logger } from "@velachess/logger";

import type { ApiDeps } from "./deps.ts";
import { POLICIES, rateLimit } from "./middleware/rate-limit.ts";
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

/**
 * The largest body any route legitimately sends. The biggest one is a PGN
 * paste; 256 KiB is a very long game with room to spare, and refusing
 * beyond it costs nothing while an unbounded POST is cheap denial of
 * service.
 */
const MAX_BODY_BYTES = 256 * 1024;

export function createApp(deps: ApiDeps) {
  const app = new Hono<ApiEnv>()
    // Headers first, so they cover every response — including the opaque
    // 500 that `onError` produces at the very bottom.
    //
    // No CSP: this app answers JSON. A content policy governs what a
    // *document* may load, and the document is served by the reverse
    // proxy in front of the SPA, not here. What matters for an API is
    // nosniff and a referrer policy, which are the middleware's defaults.
    .use("*", secureHeaders())
    // Refuse an oversized body before anything spends effort parsing it.
    .use(
      "*",
      bodyLimit({
        maxSize: MAX_BODY_BYTES,
        onError: () => {
          throw new HTTPException(413, { message: "payload too large" });
        },
      }),
    )
    // Origin check on unsafe methods. The session rides in a cookie, so a
    // forged cross-site POST would otherwise arrive authenticated — and it
    // is rejected here, before it can even cost a session lookup.
    //
    // No CORS beside it, deliberately: the SPA fetches `/api` on its own
    // origin (apps/web/src/shared/api/client.ts), so there is no second
    // origin to authorise. Adding a permissive list would widen a surface
    // that does not currently exist.
    .use("*", csrf({ origin: deps.trustedOrigins }))
    // System routes — liveness and documentation answer even when the
    // database is down; identity never touches them.
    .get("/health", (c) => c.json({ ok: true }))
    .get("/openapi.json", (c) => c.json(openApiSpec))
    // Better Auth owns everything under /auth/* — sign-in, sign-out,
    // session, sign-up. Mounted before the session gate because logging
    // in is, definitionally, done without a session. The handler shape is
    // the official Hono integration: forward the raw Request.
    //
    // It throttles itself: `rateLimit.storage: "database"` in
    // libs/infra/auth, with its own stricter rules for the sensitive
    // endpoints. No limiter of ours in front of it.
    .all("/auth/*", (c) => deps.auth.handler(c.req.raw))
    .use("*", sessionMiddleware(deps.auth))
    // Everything past the gate has a userId, which is what every policy is
    // keyed by. /health is exempt: a liveness probe that can be throttled
    // is a liveness probe that lies during an incident.
    .use("*", except("/health", rateLimit(deps, POLICIES.authenticated)))
    // Costlier actions get their own budget on top of the general one.
    .use("/accounts/:id/sync", rateLimit(deps, POLICIES.import))
    .use("/games/:id/analyze", rateLimit(deps, POLICIES.expensive))
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
      // hono's own csrf middleware throws a message-less 403 (it carries a
      // plain-text Response instead), so there is a fallback rather than an
      // `{ error: "" }` a client cannot act on.
      return c.json({ error: error.message || "request rejected" }, error.status);
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
