import { describe, expect, it } from "vitest";

import { removeAvatar, type RemoveAvatarDeps } from "../remove-avatar.ts";

const USER = "d3b07384-d9a0-4c9b-8f4e-000000000001";

function recorder() {
  const calls: string[] = [];
  const removed: string[] = [];
  const writes: Array<{ userId: string; image: null; avatarSource: string }> = [];

  const deps: RemoveAvatarDeps = {
    removeAvatarObject: async (key) => {
      calls.push("remove");
      removed.push(key);
    },
    writeAvatarState: async (userId, next) => {
      calls.push("write");
      writes.push({ userId, ...next });
    },
  };

  return { deps, calls, removed, writes };
}

describe("removing an avatar", () => {
  /** `none`, not `null`: the row has to say the user chose to have no
   * picture, or a later OAuth sign-in cannot tell that from never having
   * had one. */
  it("clears the image and records a deliberate removal", async () => {
    const { deps, writes } = recorder();

    await removeAvatar(deps, USER);

    expect(writes).toEqual([{ userId: USER, image: null, avatarSource: "none" }]);
  });

  it("deletes the object under the user's own key", async () => {
    const { deps, removed } = recorder();

    await removeAvatar(deps, USER);

    expect(removed).toEqual([`avatars/${USER}.webp`]);
  });

  /**
   * Row before bytes — the opposite of setAvatar, for the same reason. The
   * row is what the user sees, so clearing it first means a failing unlink
   * leaves an orphaned object rather than an avatar that refuses to go.
   */
  it("clears the row before deleting the bytes", async () => {
    const { deps, calls } = recorder();

    await removeAvatar(deps, USER);

    expect(calls).toEqual(["write", "remove"]);
  });

  it("is safe to repeat", async () => {
    const { deps, calls } = recorder();

    await removeAvatar(deps, USER);
    await removeAvatar(deps, USER);

    expect(calls).toEqual(["write", "remove", "write", "remove"]);
  });
});
