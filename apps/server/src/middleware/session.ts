/**
 * Resolves `userId` from the session; downstream never sees Better Auth.
 * Rejects via HTTPException so `onError` in server.ts owns the `{ error }` shape.
 */

import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

import type { Auth } from "@velachess/auth";

import type { ApiEnv } from "../server.ts";

export function sessionMiddleware(auth: Auth) {
  return createMiddleware<ApiEnv>(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) throw new HTTPException(401, { message: "unauthorized" });
    c.set("userId", session.user.id);
    await next();
  });
}
