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

const MAX_BODY_BYTES = 256 * 1024;

const configRoute = createRoute({
  method: "get",
  path: "/config",
  summary: "Sign-in methods this instance actually offers",
  responses: {
    200: {
      description: "Capability flags only, read from the running Better Auth instance",
      content: {
        "application/json": {
          schema: z.object({
            signInMethods: z.object({
              password: z.boolean(),
              passwordReset: z.boolean(),
              google: z.boolean(),
              magicLink: z.boolean(),
            }),
          }),
        },
      },
    },
  },
});

export function createApp(deps: ApiDeps) {
  // `$()` restores `.openapi`: hono's `.use()` returns a plain `Hono` type.
  const app = $(
    new OpenAPIHono<ApiEnv>({ defaultHook })
      .use("*", secureHeaders())
      .use(
        "*",
        cors({
          origin: deps.trustedOrigins,
          credentials: true,
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
      .use("*", csrf({ origin: deps.trustedOrigins })),
  )
    .route("/health", healthRoutes(buildHealthDeps(deps.readinessChecks)))
    .openapi(configRoute, async (c) => {
      const { options, socialProviders } = await deps.auth.$context;
      const password = options.emailAndPassword?.enabled === true;
      return c.json(
        {
          signInMethods: {
            password,
            passwordReset:
              password && options.emailAndPassword?.sendResetPassword !== undefined,
            google: socialProviders.some((provider) => provider.id === "google"),
            magicLink:
              options.plugins?.some((plugin) => plugin.id === "magic-link") ?? false,
          },
        },
        200,
      );
    })
    .doc31("/openapi.json", {
      openapi: "3.1.0",
      info: {
        title: "VelaChess API",
        version: "0.1.0",
        description:
          "Import your games from Chess.com, Lichess or PGN and review them with Stockfish.",
      },
    })
    .get("/docs", swaggerUI({ url: "/openapi.json" }))
    .all("/auth/*", (c) => deps.auth.handler(c.req.raw))
    .use("*", sessionMiddleware(deps.auth))
    .use("*", rateLimit(deps, POLICIES.authenticated))
    .use(
      "/accounts/:id/sync",
      rateLimit(deps, POLICIES.import, (c) => `${c.get("userId")}:${c.req.param("id")}`),
    )
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

  app.notFound((c) => c.json({ error: "not found" }, 404));
  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      // hono's csrf middleware throws a 403 without a message.
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

// Statuses raised by middleware and onError, which hono's RPC inference cannot see.
type GlobalErrorResponses = {
  401: { json: { error: string } };
  403: { json: { error: string } };
  404: { json: { error: string } };
  413: { json: { error: string } };
  429: { json: { error: string; retryAfterSeconds: number } };
  500: { json: { error: string } };
};

export type AppType = ApplyGlobalResponse<
  ReturnType<typeof createApp>,
  GlobalErrorResponses
>;
