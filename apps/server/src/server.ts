/**
 * [SERVER] — the HTTP app, assembled from injected deps (bootstrapping lives
 * in main.ts, so tests build the same app over PGlite). AppType is a type-only
 * export — importing it pulls zero runtime code.
 */

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ApplyGlobalResponse } from "hono/client";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";

import { logger } from "@velachess/infra-logger";

import type { ApiDeps } from "./deps.ts";
import {
  buildImportAccountDeps,
  buildListAccountGamesDeps,
  buildListAccountsDeps,
  buildSyncAccountDeps,
} from "./composition/accounts.ts";
import {
  buildDrillSummaryDeps,
  buildGetAnalysisDeps,
  buildRequestAnalysisDeps,
} from "./composition/analysis.ts";
import {
  buildCountDrillQueueDeps,
  buildGetNextDrillDeps,
  buildSubmitAnswerDeps,
} from "./composition/drills.ts";
import { buildDeviationsDeps } from "./composition/deviations.ts";
import {
  buildGetGameDeps,
  buildImportPgnDeps,
  buildJudgeGamesDeps,
  buildListGamesDeps,
} from "./composition/games.ts";
import { buildInsightsDeps } from "./composition/insights.ts";
import { buildOverviewDeps } from "./composition/overview.ts";
import {
  buildAddChapterDeps,
  buildCreateRepertoireDeps,
  buildDeleteRepertoireDeps,
  buildExtractRepertoireDeps,
  buildGetChapterDeps,
  buildGetRepertoireDeps,
  buildListRepertoiresDeps,
} from "./composition/repertoires.ts";
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
    // Declared before every route, as hono's docs require ("should be called
    // before the route"), and mirroring Better Auth's Hono guide: an explicit
    // origin list rather than a wildcard, `credentials: true` because the
    // session rides in a cookie, and the very same list Better Auth trusts —
    // one source of truth, so CORS and the session cannot disagree about who
    // is allowed to talk to this API.
    //
    // Today that list is the app's own origin, and a same-origin request
    // carries no Origin header worth answering, so this middleware is
    // effectively inert. It exists for the deployment that puts the SPA on a
    // separate host, and it fails closed until that host is declared.
    //
    // Also the layer that stops a forged JSON fetch() — see csrf() below
    // for the request class this one doesn't cover.
    .use(
      "*",
      cors({
        origin: deps.trustedOrigins,
        credentials: true,
        // What the SPA actually sends. Anything else is not a request this
        // API knows how to serve.
        allowHeaders: ["Content-Type"],
        maxAge: 600,
      }),
    )
    .use(
      "*",
      bodyLimit({
        maxSize: MAX_BODY_BYTES,
        onError: () => {
          throw new HTTPException(413, { message: "payload too large" });
        },
      }),
    )
    // Origin check for requests CORS never sees: a plain <form> POST needs
    // no preflight (content-type form-urlencoded/multipart/text-plain, or
    // absent), so it reaches here un-vetted — and SameSite=Lax lets a
    // top-level form submission carry the cookie cross-site regardless.
    // A JSON fetch() never matches this check; that's CORS's job, above.
    .use("*", csrf({ origin: deps.trustedOrigins }))
    // System routes — liveness and documentation answer even when the
    // database is down; identity never touches them.
    .get("/health", (c) => c.json({ ok: true }))
    // Public because the sign-in screen consumes it before there is anyone to
    // authenticate. Capability flags only — see SignInMethods in deps.ts.
    .get("/config", (c) => c.json({ signInMethods: deps.signInMethods }))
    .get("/openapi.json", (c) => c.json(openApiSpec))
    // Better Auth owns everything under /auth/* — sign-in, sign-out,
    // session, sign-up. Mounted before the session gate because logging
    // in is, definitionally, done without a session. The handler shape is
    // the official Hono integration: forward the raw Request. It throttles
    // itself; no limiter of ours in front of it.
    .all("/auth/*", (c) => deps.auth.handler(c.req.raw))
    .use("*", sessionMiddleware(deps.auth))
    // Every policy is keyed by userId, so this sits below the gate. No
    // `/health` exemption needed: it's registered above the gate, so a
    // request to it never reaches this line (tests/openapi.test.ts
    // asserts the ordering).
    .use("*", rateLimit(deps, POLICIES.authenticated))
    // Costlier actions get their own budget on top of the general one.
    // import is keyed per account, not per user: the 60s sync cooldown
    // (SYNC_COOLDOWN_SECONDS) is already per account, and a user syncing
    // several tracked accounts must not have the first ones spend the
    // budget the last one needs.
    .use(
      "/accounts/:id/sync",
      rateLimit(deps, POLICIES.import, (c) => `${c.get("userId")}:${c.req.param("id")}`),
    )
    .use("/games/:id/analyze", rateLimit(deps, POLICIES.expensive))
    .route(
      "/accounts",
      accountsRoutes({
        list: buildListAccountsDeps(deps.db, deps.syncQueue),
        games: buildListAccountGamesDeps(deps.db),
        connect: buildImportAccountDeps(deps.db, deps.analysisQueue, deps.sync?.fetch),
        sync: buildSyncAccountDeps(deps.db, deps.analysisQueue, deps.sync?.fetch),
      }),
    )
    .route(
      "/games",
      gamesRoutes({
        get: buildGetGameDeps(deps.db, deps.sync?.fetch),
        list: buildListGamesDeps(deps.db),
        importPgn: buildImportPgnDeps(deps.db, deps.analysisQueue),
        judge: buildJudgeGamesDeps(deps.db, deps.analysisQueue),
        analysis: {
          getAnalysis: buildGetAnalysisDeps(deps.db, deps.analysisQueue),
          requestAnalysis: buildRequestAnalysisDeps(deps.db, deps.analysisQueue),
          drillSummary: buildDrillSummaryDeps(deps.db),
          watchers: deps.watchers,
        },
      }),
    )
    .route("/deviations", deviationsRoutes(buildDeviationsDeps(deps.db)))
    .route(
      "/repertoires",
      repertoiresRoutes({
        list: buildListRepertoiresDeps(deps.db),
        create: buildCreateRepertoireDeps(deps.db),
        extract: buildExtractRepertoireDeps(deps.db),
        detail: buildGetRepertoireDeps(deps.db),
        remove: buildDeleteRepertoireDeps(deps.db),
        addChapter: buildAddChapterDeps(deps.db),
        chapter: buildGetChapterDeps(deps.db),
      }),
    )
    .route(
      "/drill",
      drillRoutes({
        queue: buildCountDrillQueueDeps(deps.db),
        next: buildGetNextDrillDeps(deps.db, deps.scheduler),
        answer: buildSubmitAnswerDeps(deps.db, deps.scheduler),
      }),
    )
    .route("/overview", overviewRoutes(buildOverviewDeps(deps.db)))
    .route("/insights", insightsRoutes(buildInsightsDeps(deps.db)));

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

/**
 * Every status a route's own handler chain never declares, because it
 * comes from onError/notFound or from middleware mounted via `.use()`
 * rather than a route's own `.get`/`.post` chain (401 the session gate,
 * 403 csrf, 404 unknown paths, 413 the body ceiling, 429 the rate
 * limiter, 500 unhandled) — hono's RPC inference can't see any of these
 * on its own, so a client reading `res.status === 429` would get `never`
 * for the body without this.
 */
type GlobalErrorResponses = {
  401: { json: { error: string } };
  403: { json: { error: string } };
  404: { json: { error: string } };
  413: { json: { error: string } };
  429: { json: { error: string; retryAfterSeconds: number } };
  500: { json: { error: string } };
};

/** Type-only contract for clients (hono/client). Never import the value. */
export type AppType = ApplyGlobalResponse<
  ReturnType<typeof createApp>,
  GlobalErrorResponses
>;
