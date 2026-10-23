/**
 * Every failure names the variable and the requirement. `production` is
 * computed independently of envalid's own `isProduction`, which treats an
 * unset NODE_ENV as production — this repo's opposite.
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
      // relative path is the policy check below.
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

  // A relative root resolves against the working directory, which differs
  // between `pnpm dev:server` and a container's WORKDIR. In production it
  // writes uploads into the image's own layer, where the next `up --build`
  // deletes them.
  if (production && !root.startsWith("/")) {
    throw new Error(
      `VELACHESS_STORAGE_DIR must be an absolute path in production, got: ${root}. ` +
        "In compose this is the mount point of a named volume, e.g. /data.",
    );
  }

  return { root };
}
