import { isAbsolute } from "node:path";

export function resolveStorageEnv(env: Record<string, string | undefined>) {
  const root = env["VELACHESS_STORAGE_DIR"] || ".data/storage";

  if (env["NODE_ENV"] === "production" && !isAbsolute(root)) {
    throw new Error(
      `VELACHESS_STORAGE_DIR must be an absolute path in production, got: ${root}. ` +
        "In compose this is the mount point of a named volume, e.g. /data.",
    );
  }

  return { root };
}
