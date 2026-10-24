import { describe, expect, it } from "vitest";

import { deleteAccount, type DeleteAccountDeps } from "../delete-account.ts";

const USER = "d3b07384-d9a0-4c9b-8f4e-000000000001";

function recorder(failing?: "removeAvatarObject") {
  const calls: string[] = [];
  const deps: DeleteAccountDeps = {
    removeAvatarObject: async (key) => {
      calls.push(`remove ${key}`);
      if (failing === "removeAvatarObject") throw new Error("disk full");
    },
    deleteUser: async (userId) => {
      calls.push(`delete ${userId}`);
    },
  };
  return { deps, calls };
}

describe("deleting an account", () => {
  it("removes the avatar under the user's own key, then the user", async () => {
    const { deps, calls } = recorder();

    await deleteAccount(deps, USER);

    expect(calls).toEqual([`remove avatars/${USER}.webp`, `delete ${USER}`]);
  });

  it("keeps the user when the avatar cannot be removed, so the request can be retried", async () => {
    const { deps, calls } = recorder("removeAvatarObject");

    await expect(deleteAccount(deps, USER)).rejects.toThrow("disk full");

    expect(calls).toEqual([`remove avatars/${USER}.webp`]);
  });
});
