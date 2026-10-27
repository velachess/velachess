/**
 * Keys are opaque strings the caller owns; this file guarantees only that a
 * key cannot escape the root and that a reader never sees a half-written
 * object.
 */

import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface FileStore {
  /** Throws for a key that would resolve outside the root. */
  put(key: string, bytes: Uint8Array): Promise<void>;
  /**
   * Null rather than a throw when the object is absent, so "no avatar" maps
   * to a 404 rather than a 500.
   *
   * `Uint8Array<ArrayBuffer>`, not the bare `Uint8Array` that now defaults
   * to `ArrayBufferLike`: the store always hands back a copy it owns, and
   * saying so is what lets a caller pass it straight to `Response`, whose
   * `BodyInit` will not take the widened type.
   */
  get(key: string): Promise<Uint8Array<ArrayBuffer> | null>;
  /** Absent is success. */
  remove(key: string): Promise<void>;
}

/**
 * One check instead of separate rules for `..` segments, absolute keys and
 * the empty key, so there is no charset convention to keep in sync with
 * whatever a caller derives keys from. No key is built from request input
 * today; the invariant belongs to whatever knows what a root is.
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
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function createFileStore(root: string): FileStore {
  return {
    async put(key, bytes) {
      const file = resolveKey(root, key);
      await mkdir(path.dirname(file), { recursive: true });

      // Rename is atomic within a filesystem, so a concurrent reader sees
      // the old object or the new one, never a truncated one, and replacing
      // one needs no delete.
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
        // Not the Buffer readFile hands back: it is a Uint8Array subclass
        // carrying Node-only behaviour (its own toJSON, pooled backing
        // memory a view could alias) across a boundary whose contract says
        // Uint8Array. Sized-then-set so the buffer type is the concrete
        // ArrayBuffer that contract promises.
        const copy = new Uint8Array(contents.byteLength);
        copy.set(contents);
        return copy;
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
