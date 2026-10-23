import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { AVATAR_MAX_BYTES, readAvatar, removeAvatar, setAvatar } from "@velachess/user";
import type { ReadAvatarDeps, RemoveAvatarDeps, SetAvatarDeps } from "@velachess/user";

import type { ApiEnv } from "../server.ts";
import { defaultHook, errorResponseSchema } from "../validation.ts";

const AVATAR_REJECTION = {
  UNSUPPORTED_FORMAT: "unsupported-format",
  TOO_LARGE: "too-large",
} as const;

/**
 * Derived from the byte ceiling, since base64 inflates by four bytes per
 * three. The cheap outer guard: `AVATAR_MAX_BYTES` speaks about the image
 * and server.ts's `bodyLimit` about the request.
 */
const MAX_AVATAR_BASE64_CHARS = Math.ceil((AVATAR_MAX_BYTES * 4) / 3) + 4;

const setAvatarSchema = z.object({
  /** Raw base64: rejecting a `data:` prefix here beats decoding it and
   * finding the bytes are the ASCII of a MIME type. */
  image: z
    .string()
    .min(1)
    .max(MAX_AVATAR_BASE64_CHARS)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "must be raw base64 with no data: prefix"),
});

const avatarSchema = z.object({
  /** The cache-busted URL the browser renders from the session. */
  image: z.string(),
});

const setAvatarRoute = createRoute({
  method: "post",
  path: "/avatar",
  summary: "Set the signed-in user's avatar",
  description:
    "The image is validated from its own bytes, not the declared type: a payload whose magic bytes are not JPEG, PNG or WebP is refused whatever it claims to be. Replaces any previous avatar in place. The returned URL carries a cache buster, so it changes on every upload.",
  request: {
    body: { content: { "application/json": { schema: setAvatarSchema } } },
  },
  responses: {
    200: {
      description: "Stored, with the URL now on the user",
      content: { "application/json": { schema: avatarSchema } },
    },
    400: {
      description: "Not an image we accept",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    413: {
      description: "Larger than the avatar ceiling",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

const removeAvatarRoute = createRoute({
  method: "delete",
  path: "/avatar",
  summary: "Remove the signed-in user's avatar",
  description:
    "Falls back to initials, and records the removal as deliberate so a later sign-in does not restore a provider picture over it. Idempotent.",
  responses: { 204: { description: "Removed, or already absent" } },
});

const getAvatarRoute = createRoute({
  method: "get",
  path: "/avatar",
  summary: "The signed-in user's avatar bytes",
  description:
    "Serves only the caller's own avatar — there is no id to address, so there is nothing to enumerate. Cached immutably because the URL carries a content version; `Vary: Cookie` keeps a shared cache from handing one user's image to another.",
  request: {
    query: z.object({
      v: z
        .string()
        .optional()
        .describe("Cache buster, part of the stored URL. Ignored by the handler.")
        .openapi({ param: { name: "v", in: "query" } }),
    }),
  },
  responses: {
    // A literal schema, not Zod: the typed helper narrows `c.body` to what
    // the schema describes, which rejects a Uint8Array.
    200: {
      description: "The image, typed from its own bytes",
      content: {
        "image/webp": { schema: { type: "string", format: "binary" } },
        "image/jpeg": { schema: { type: "string", format: "binary" } },
        "image/png": { schema: { type: "string", format: "binary" } },
      },
    },
    404: {
      description: "This user has no avatar",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

export interface UserRouteDeps {
  set: SetAvatarDeps;
  remove: RemoveAvatarDeps;
  read: ReadAvatarDeps;
}

export function userRoutes(deps: UserRouteDeps) {
  return (
    new OpenAPIHono<ApiEnv>({ defaultHook })
      // Decoding base64 is transport translation, so it happens here and
      // the slice only ever sees bytes. A payload that is valid base64 but
      // not an image gets refused by the slice, from the bytes themselves.
      .openapi(setAvatarRoute, async (c) => {
        const bytes = new Uint8Array(Buffer.from(c.req.valid("json").image, "base64"));
        const outcome = await setAvatar(deps.set, c.get("userId"), bytes);

        if (outcome.status === "rejected") {
          if (outcome.reason === AVATAR_REJECTION.TOO_LARGE) {
            return c.json({ error: "image too large" }, 413);
          }
          return c.json({ error: "unsupported image format" }, 400);
        }

        return c.json({ image: outcome.image }, 200);
      })
      .openapi(removeAvatarRoute, async (c) => {
        await removeAvatar(deps.remove, c.get("userId"));
        return c.body(null, 204);
      })
      .openapi(getAvatarRoute, async (c) => {
        const stored = await readAvatar(deps.read, c.get("userId"));
        if (stored === null) return c.json({ error: "no avatar" }, 404);

        // A platform Response, not `c.body`/`c.newResponse`: both narrow to
        // Hono's `Data` (string | ArrayBuffer | ReadableStream), which a
        // Uint8Array is not. games.ts returns a Response here too, by way
        // of `streamSSE`.
        return new Response(stored.bytes, {
          status: 200,
          headers: {
            // Sniffed from the bytes, never echoed from what was uploaded.
            "content-type": stored.mediaType,
            // Safe to cache forever because the URL changes on every
            // upload; `private` and `Vary: Cookie` are the parts that
            // matter — a shared cache must never answer one user with
            // another's image.
            "cache-control": "private, max-age=31536000, immutable",
            vary: "Cookie",
            // Belt to the global secureHeaders() nosniff: a polyglot image
            // opened directly can neither be read as a document nor run.
            "content-security-policy": "default-src 'none'; sandbox",
          },
        });
      })
  );
}
