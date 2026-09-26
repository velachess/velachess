import { describe, expect, it } from "vitest";

import { AVATAR_MAX_BYTES } from "../../avatar.ts";
import { setAvatar, type SetAvatarDeps } from "../set-avatar.ts";

const USER = "d3b07384-d9a0-4c9b-8f4e-000000000001";

const webp = (padding = 0) =>
  new Uint8Array([
    0x52,
    0x49,
    0x46,
    0x46,
    0,
    0,
    0,
    0,
    0x57,
    0x45,
    0x42,
    0x50,
    ...Array.from<number>({ length: padding }).fill(0),
  ]);

/** Records the order of effects, because the order is the invariant. */
function recorder() {
  const calls: string[] = [];
  const puts: Array<{ key: string; bytes: Uint8Array }> = [];
  const writes: Array<{ userId: string; image: string; avatarSource: string }> = [];

  const deps: SetAvatarDeps = {
    putAvatarObject: async (key, bytes) => {
      calls.push("put");
      puts.push({ key, bytes });
    },
    writeAvatarState: async (userId, next) => {
      calls.push("write");
      writes.push({ userId, ...next });
    },
  };

  return { deps, calls, puts, writes };
}

describe("accepting an avatar", () => {
  it("stores the bytes under the user's key and records a custom source", async () => {
    const { deps, puts, writes } = recorder();

    const outcome = await setAvatar(deps, USER, webp());

    expect(outcome).toEqual({ status: "saved", image: expect.any(String) });
    expect(puts).toHaveLength(1);
    expect(puts[0]!.key).toBe(`avatars/${USER}.webp`);
    expect(writes[0]).toMatchObject({ userId: USER, avatarSource: "custom" });
  });

  it("returns a cache-busted URL and writes that same URL", async () => {
    const { deps, writes } = recorder();

    const outcome = await setAvatar(deps, USER, webp());

    expect(outcome.status === "saved" && outcome.image).toMatch(
      /^\/api\/me\/avatar\?v=\d+$/,
    );
    expect(writes[0]!.image).toBe(outcome.status === "saved" ? outcome.image : "");
  });

  /**
   * Bytes before the row. The other order would point the row at an object
   * that is not there yet, so a failed upload shows the user a broken
   * image instead of the avatar they already had.
   */
  it("writes the bytes before the row", async () => {
    const { deps, calls } = recorder();

    await setAvatar(deps, USER, webp());

    expect(calls).toEqual(["put", "write"]);
  });
});

describe("refusing an avatar", () => {
  it("refuses bytes over the ceiling without touching anything", async () => {
    const { deps, calls } = recorder();

    const outcome = await setAvatar(deps, USER, webp(AVATAR_MAX_BYTES));

    expect(outcome).toEqual({ status: "rejected", reason: "too-large" });
    expect(calls).toEqual([]);
  });

  /** The size check runs first, so an oversized payload is never sniffed —
   * and an oversized payload that is also not an image reports the size. */
  it("refuses markup, whatever a caller might have called it", async () => {
    const { deps, calls } = recorder();

    const outcome = await setAvatar(
      deps,
      USER,
      new TextEncoder().encode('<svg onload="alert(1)"/>'),
    );

    expect(outcome).toEqual({ status: "rejected", reason: "unsupported-format" });
    expect(calls).toEqual([]);
  });

  it("refuses an empty payload", async () => {
    const { deps, calls } = recorder();

    const outcome = await setAvatar(deps, USER, new Uint8Array());

    expect(outcome).toEqual({ status: "rejected", reason: "unsupported-format" });
    expect(calls).toEqual([]);
  });
});
