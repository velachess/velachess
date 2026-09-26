import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFileStore, type FileStore } from "../files.ts";

let root: string;
let store: FileStore;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "velachess-storage-"));
  store = createFileStore(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const bytes = (...values: number[]) => new Uint8Array(values);

describe("storing and reading bytes", () => {
  it("returns exactly what was written", async () => {
    await store.put("avatars/abc.webp", bytes(0x52, 0x49, 0x46, 0x46, 0x00));

    expect(await store.get("avatars/abc.webp")).toEqual(
      bytes(0x52, 0x49, 0x46, 0x46, 0x00),
    );
  });

  it("creates the intermediate directories", async () => {
    await store.put("avatars/nested/deep.webp", bytes(1));

    expect(await store.get("avatars/nested/deep.webp")).toEqual(bytes(1));
  });

  /** An absent object is an answer, not a failure — a caller maps it to a
   * 404. A throw here would surface as a 500 for a user who simply has no
   * avatar. */
  it("answers null for a key that was never written", async () => {
    expect(await store.get("avatars/missing.webp")).toBeNull();
  });

  it("replaces an existing object and leaves no staging file behind", async () => {
    await store.put("avatars/abc.webp", bytes(1, 1, 1));
    await store.put("avatars/abc.webp", bytes(2, 2));

    expect(await store.get("avatars/abc.webp")).toEqual(bytes(2, 2));
    expect(await readdir(path.join(root, "avatars"))).toEqual(["abc.webp"]);
  });
});

describe("removing", () => {
  it("deletes the object", async () => {
    await store.put("avatars/abc.webp", bytes(1));
    await store.remove("avatars/abc.webp");

    expect(await store.get("avatars/abc.webp")).toBeNull();
  });

  /** Remove is idempotent so a caller retrying a failed cleanup, or
   * removing an avatar that was never uploaded, is not an error path. */
  it("succeeds for a key that is not there", async () => {
    await expect(store.remove("avatars/never.webp")).resolves.toBeUndefined();
    await store.put("avatars/abc.webp", bytes(1));
    await store.remove("avatars/abc.webp");
    await expect(store.remove("avatars/abc.webp")).resolves.toBeUndefined();
  });
});

describe("keys that try to leave the root", () => {
  // The store refuses before touching the filesystem, rather than
  // sanitising and continuing — a key it cannot honour is a caller bug,
  // and quietly rewriting it would hide that.
  const refused = [
    "../escaped.webp",
    "avatars/../../escaped.webp",
    "avatars/../../../../../../etc/passwd",
    "/etc/passwd",
    "avatars/..",
    "..",
    "",
    ".",
  ];

  for (const key of refused) {
    it(`refuses ${JSON.stringify(key)}`, async () => {
      await expect(store.put(key, bytes(1))).rejects.toThrow(/escapes the root/);
      await expect(store.get(key)).rejects.toThrow(/escapes the root/);
      await expect(store.remove(key)).rejects.toThrow(/escapes the root/);
    });
  }

  // The root itself is not an object, so the key that resolves to it is
  // refused like any other escape — otherwise `put` would try to write
  // over the directory every other object lives in.
  it("refuses a key that resolves to the root itself", async () => {
    await expect(store.put("avatars/../", bytes(1))).rejects.toThrow(/escapes the root/);
  });

  it("writes nothing outside the root when a key is refused", async () => {
    const sibling = path.join(path.dirname(root), "velachess-storage-victim");
    await writeFile(sibling, "untouched");

    await expect(store.put(`../${path.basename(sibling)}`, bytes(0xff))).rejects.toThrow(
      /storage key/,
    );

    expect(await readFile(sibling, "utf8")).toBe("untouched");
    await rm(sibling, { force: true });
  });
});
