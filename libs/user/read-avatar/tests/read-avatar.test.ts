import { describe, expect, it } from "vitest";

import { readAvatar, type ReadAvatarDeps } from "../read-avatar.ts";

const USER = "d3b07384-d9a0-4c9b-8f4e-000000000001";
const OTHER = "d3b07384-d9a0-4c9b-8f4e-000000000002";

const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x99,
]);

function store(objects: Record<string, Uint8Array>) {
  const asked: string[] = [];
  const deps: ReadAvatarDeps = {
    getAvatarObject: async (key) => {
      asked.push(key);
      return objects[key] ?? null;
    },
  };
  return { deps, asked };
}

describe("reading an avatar", () => {
  it("returns the bytes with the type sniffed from them", async () => {
    const { deps } = store({ [`avatars/${USER}.webp`]: webp });

    expect(await readAvatar(deps, USER)).toEqual({
      bytes: webp,
      mediaType: "image/webp",
    });
  });

  it("answers null when the user has no object", async () => {
    const { deps } = store({});

    expect(await readAvatar(deps, USER)).toBeNull();
  });

  /**
   * The isolation guarantee is structural: there is no key parameter, so a
   * caller cannot name another user's object even by mistake. This asserts
   * the derivation, which is the thing that would have to break first.
   */
  it("only ever asks for the key belonging to the given user", async () => {
    const { deps, asked } = store({ [`avatars/${OTHER}.webp`]: webp });

    const result = await readAvatar(deps, USER);

    expect(asked).toEqual([`avatars/${USER}.webp`]);
    expect(result).toBeNull();
  });

  /** Bytes that arrived by some other route — a hand-placed file, a
   * restored backup — get no Content-Type invented for them. */
  it("treats unrecognisable bytes as no avatar at all", async () => {
    const { deps } = store({
      [`avatars/${USER}.webp`]: new TextEncoder().encode("<svg onload=1/>"),
    });

    expect(await readAvatar(deps, USER)).toBeNull();
  });
});
