import { swaggerUI } from "@hono/swagger-ui";
import { $, createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import type { ApplyGlobalResponse } from "hono/client";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import type { RateLimitInfo } from "hono-rate-limiter";

import { logger } from "@velachess/infra-logger";

import type { ApiDeps } from "./deps.ts";
import {
  buildDisconnectAccountDeps,
  buildGetSyncDeps,
  buildWatchSyncsDeps,
  buildImportAccountDeps,
  buildListAccountGamesDeps,
  buildListAccountsDeps,
  buildRequestSyncDeps,
  buildSyncAllAccountsDeps,
} from "./composition/accounts.ts";
import {
  buildReadAvatarDeps,
  buildRemoveAvatarDeps,
  buildSetAvatarDeps,
} from "./composition/user.ts";
import {
  buildGetGameDeps,
  buildImportPgnDeps,
  buildListGamesDeps,
} from "./composition/games.ts";
import { buildHealthDeps } from "./composition/health.ts";
import { POLICIES, rateLimit } from "./middleware/rate-limit.ts";
import { sessionMiddleware } from "./middleware/session.ts";
import { defaultHook } from "./validation.ts";
import { accountsRoutes } from "./routes/accounts.ts";
import { syncsRoutes } from "./routes/syncs.ts";
import { userRoutes } from "./routes/user.ts";
import { gamesRoutes } from "./routes/games.ts";
import { healthRoutes } from "./routes/health.ts";

const apiLogger = logger.child({ component: "api" });

export interface ApiEnv {
  Variables: {
    userId: string;
    rateLimit: RateLimitInfo;
  };
}

/**
 * The largest body any route legitimately sends — a PGN paste. An unbounded
 * POST is cheap denial of service.
 */
const MAX_BODY_BYTES = 256 * 1024;

const configRoute = createRoute({
  method: "get",
  path: "/config",
  summary: "Sign-in methods this instance actually offers",
  responses: {
    200: {
      description: "Capability flags only — see SignInMethods in deps.ts",
      content: {
        "application/json": {
          schema: z.object({
            signInMethods: z.object({ password: z.boolean(), google: z.boolean() }),
          }),
        },
      },
    },
  },
});

export function createApp(deps: ApiDeps) {
  // `$()` converts the chain back to `OpenAPIHono`'s type: `.use()` returns a
  // plain `Hono`, which drops `.openapi`. Needed because /config sits after
  // four `.use()` calls.
  const app = $(
    new OpenAPIHono<ApiEnv>({ defaultHook })
      // First, so the headers cover every response, including the opaque 500
      // `onError` produces at the bottom. No CSP: a content policy governs
      // what a document may load, and the document is served by the proxy in
      // front of the SPA. An API needs nosniff and a referrer policy, which
      // are the middleware's defaults.
      .use("*", secureHeaders())
      // Before every route, as hono requires, with `credentials: true`
      // because the session rides in a cookie and the same origin list Better
      // Auth trusts, so CORS and the session cannot disagree about who may
      // talk to this API.
      //
      // That list is currently the app's own origin, and a same-origin
      // request carries no Origin header worth answering, so this is
      // effectively inert until a deployment puts the SPA on a separate host.
      //
      // Also the layer that stops a forged JSON fetch(); csrf() below covers
      // the class this one does not.
      .use(
        "*",
        cors({
          origin: deps.trustedOrigins,
          credentials: true,
          // What the SPA sends; nothing else is a request this API serves.
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
      // no preflight, so it arrives un-vetted, and SameSite=Lax lets a
      // top-level submission carry the cookie cross-site anyway. A JSON
      // fetch() never matches this check — that is CORS's job, above.
      .use("*", csrf({ origin: deps.trustedOrigins })),
  )
    // Health and documentation answer even when the database is down, and
    // identity never touches them.
    .route("/health", healthRoutes(buildHealthDeps(deps.readinessChecks)))
    // Public because the sign-in screen reads it before there is anyone to
    // authenticate. Capability flags only.
    .openapi(configRoute, (c) => c.json({ signInMethods: deps.signInMethods }, 200))
    // Generated from every `createRoute`/`.openapi()` above, so there is no
    // hand-maintained document to drift.
    .doc31("/openapi.json", {
      openapi: "3.1.0",
      info: {
        title: "VelaChess API",
        version: "0.1.0",
        description:
          "Import your games from Chess.com, Lichess or PGN and review them with Stockfish.",
      },
    })
    // Public like the spec it reads: nothing here is secret, and someone
    // deciding whether to integrate has no session yet.
    .get("/docs", swaggerUI({ url: "/openapi.json" }))
    // Mounted before the session gate because signing in is done without a
    // session. The raw-Request forward is the official Hono integration, and
    // Better Auth throttles itself, so no limiter of ours sits in front.
    .all("/auth/*", (c) => deps.auth.handler(c.req.raw))
    .use("*", sessionMiddleware(deps.auth))
    // Every policy is keyed by userId, so this sits below the gate. Health
    // needs no exemption: registered above, its requests never reach this
    // line (tests/openapi.test.ts asserts the ordering).
    .use("*", rateLimit(deps, POLICIES.authenticated))
    // Keyed per account, not per user: the sync cooldown is per account too,
    // and a user syncing several accounts must not have the first ones spend
    // the budget the last one needs.
    .use(
      "/accounts/:id/sync",
      rateLimit(deps, POLICIES.import, (c) => `${c.get("userId")}:${c.req.param("id")}`),
    )
    // Its own budget, independent of each account's cooldown-backed one.
    .use("/accounts/sync", rateLimit(deps, POLICIES.import))
    .route(
      "/me",
      userRoutes({
        set: buildSetAvatarDeps(deps.db, deps.files),
        remove: buildRemoveAvatarDeps(deps.db, deps.files),
        read: buildReadAvatarDeps(deps.files),
      }),
    )
    .route(
      "/accounts",
      accountsRoutes({
        list: buildListAccountsDeps(deps.db),
        games: buildListAccountGamesDeps(deps.db),
        connect: buildImportAccountDeps(deps.db, deps.syncQueue, deps.sync?.fetch),
        sync: buildRequestSyncDeps(deps.db, deps.syncQueue),
        syncAll: buildSyncAllAccountsDeps(deps.db, deps.syncQueue),
        disconnect: buildDisconnectAccountDeps(deps.db),
      }),
    )
    .route(
      "/syncs",
      syncsRoutes({
        get: buildGetSyncDeps(deps.db, deps.syncQueue),
        watch: buildWatchSyncsDeps(deps.db, deps.syncNotifications),
      }),
    )
    .route(
      "/games",
      gamesRoutes({
        get: buildGetGameDeps(deps.db, deps.sync?.fetch),
        list: buildListGamesDeps(deps.db),
        importPgn: buildImportPgnDeps(deps.db),
      }),
    );

  // One JSON error contract everywhere: an HTTPException's status and
  // message become the same `{ error }` shape the handlers speak, so a
  // thrown rejection and a returned one are indistinguishable on the wire.
  // Everything else is a defect, logged with the request context and
  // answered as an opaque 500 so internals never reach a response body.
  app.notFound((c) => c.json({ error: "not found" }, 404));
  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      // hono's csrf middleware throws a message-less 403, so the fallback
      // avoids an `{ error: "" }` a client cannot act on.
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
 * The statuses that come from onError/notFound or from `.use()` middleware
 * rather than a route's own chain. Hono's RPC inference cannot see them, so
 * without this a client reading `res.status === 429` gets `never` for the
 * body.
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
