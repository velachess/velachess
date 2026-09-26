/**
 * Bytes under one root on a filesystem. Keys are opaque strings the
 * caller owns; this file only guarantees that a key can never escape the
 * root, and that a reader never sees a half-written object.
 */

import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface FileStore {
  /** Throws for a key that would resolve outside the root. */
  put(key: string, bytes: Uint8Array): Promise<void>;
  /** `null` — not a throw — when the object is absent, so "no avatar" is
   * an answer a caller can map to a 404 rather than a 500. */
  get(key: string): Promise<Uint8Array | null>;
  /** Absent is success: remove is idempotent by construction. */
  remove(key: string): Promise<void>;
}

/**
 * One check, stating the only thing this library actually promises: a key
 * resolves to a path inside the root. It refuses `..` segments, absolute
 * keys and the empty key as a consequence rather than as separate rules,
 * so there is no charset convention to keep in sync with whatever a
 * caller derives keys from.
 *
 * No caller can violate this today — every key is `avatars/<uuid>` built
 * from the session's user id, never from request input. The check exists
 * because the invariant belongs to the thing that knows what a root is,
 * rather than to every present and future caller that happens to hold a
 * string.
 */
function resolveKey(root: string, key: string): string {
  const base = path.resolve(root);
  const resolved = path.resolve(base, key);

  if (!resolved.startsWith(base + path.sep)) {
    throw new Error(`storage key escapes the root: ${key}`);
  }

  return resolved;
}

function isMissing(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "ENOENT";
}

export function createFileStore(root: string): FileStore {
  return {
    async put(key, bytes) {
      const file = resolveKey(root, key);
      await mkdir(path.dirname(file), { recursive: true });

      // Write beside the target and rename onto it. Rename is atomic
      // within a filesystem, so a concurrent reader sees either the old
      // object or the new one, never a truncated one — and replacing an
      // object needs no delete, which is what keeps the orphan class
      // empty for a fixed-key scheme.
      const staging = `${file}.tmp-${randomUUID()}`;
      try {
        await writeFile(staging, bytes);
        await rename(staging, file);
      } catch (error) {
        await unlink(staging).catch(() => undefined);
        throw error;
      }
    },

    async get(key) {
      try {
        const contents = await readFile(resolveKey(root, key));
        // Copied into a plain Uint8Array, not returned as the Buffer
        // readFile hands back. Buffer is a Uint8Array subclass, so the
        // type would pass either way, but it carries Node-only behaviour
        // (its own toJSON, and pooled backing memory a view could alias)
        // across a boundary whose contract says Uint8Array. One copy of
        // an avatar-sized object is not worth the ambiguity.
        return new Uint8Array(contents);
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },

    async remove(key) {
      try {
        await unlink(resolveKey(root, key));
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    },
  };
}
