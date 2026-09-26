/**
 * [STORAGE ENV] — turns ambient env vars into a validated storage root, or
 * throws a message naming the variable and requirement to fix. Pure
 * (`resolveStorageEnv(env)` takes env as a value) so main.ts stays wiring.
 *
 * `production` is computed independently of envalid's own isProduction,
 * which treats an unset NODE_ENV as production — this repo's opposite.
 * Mirrors libs/infra/auth/env.ts deliberately; the two are the same shape.
 */

import { cleanEnv, str } from "envalid";

export interface ResolvedStorageEnv {
  /** Absolute in production, possibly relative in development. */
  root: string;
}

export function resolveStorageEnv(
  env: Record<string, string | undefined>,
): ResolvedStorageEnv {
  const production = env["NODE_ENV"] === "production";

  const cleaned = cleanEnv(
    env,
    {
      // A bare default, not devDefault: whether production may rely on a
      // relative path is the policy check below, not a shape one.
      VELACHESS_STORAGE_DIR: str({ default: ".data/storage" }),
    },
    {
      reporter: ({ errors }) => {
        const [firstError] = Object.values(errors);
        if (firstError) throw firstError;
      },
    },
  );

  const root = cleaned.VELACHESS_STORAGE_DIR;

  // A relative root resolves against the process's working directory,
  // which differs between `pnpm dev:server` at the repo root and a
  // container's WORKDIR. In production that silently writes uploads into
  // the image's own layer, where the next `up --build` deletes them —
  // data loss that looks like a working deploy until someone restarts.
  if (production && !root.startsWith("/")) {
    throw new Error(
      `VELACHESS_STORAGE_DIR must be an absolute path in production, got: ${root}. ` +
        "In compose this is the mount point of a named volume, e.g. /data.",
    );
  }

  return { root };
}
