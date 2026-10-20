// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { useMyAccounts as useMyAccountsType } from "../my-accounts.ts";
import type { RememberedAccount } from "../my-accounts.ts";

const account: RememberedAccount = {
  accountId: "a1",
  platform: "chess_com",
  username: "test-player",
};

let useMyAccounts: typeof useMyAccountsType;

describe("what this device remembers", () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.resetModules();
    ({ useMyAccounts } = await import("../my-accounts.ts"));
    useMyAccounts.setState({ accounts: [] });
  });

  it("starts remembering nothing", () => {
    expect(useMyAccounts.getState().accounts).toEqual([]);
  });

  it("survives a reload — that is the whole point of the store", () => {
    useMyAccounts.getState().remember(account);

    // What a fresh tab would read back from disk.
    const stored = localStorage.getItem("velachess.my-accounts");
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!).state.accounts).toEqual([account]);
  });

  it("re-importing an account replaces the entry and keeps the newer name", () => {
    // Identity is the account id — the same row can come back renamed
    // after the platform normalises it differently.
    useMyAccounts.getState().remember(account);
    useMyAccounts.getState().remember({ ...account, username: "test_player" });

    expect(useMyAccounts.getState().accounts).toEqual([
      { ...account, username: "test_player" },
    ]);
  });

  it("keeps one entry per account, so two platforms both fit", () => {
    useMyAccounts.getState().remember(account);
    useMyAccounts
      .getState()
      .remember({ ...account, accountId: "a2", platform: "lichess" });

    expect(useMyAccounts.getState().accounts).toHaveLength(2);
  });

  it("forgetting removes only that account", () => {
    useMyAccounts.getState().remember(account);
    useMyAccounts
      .getState()
      .remember({ ...account, accountId: "a2", platform: "lichess" });

    useMyAccounts.getState().forget("a1");

    expect(useMyAccounts.getState().accounts.map(({ accountId }) => accountId)).toEqual([
      "a2",
    ]);
  });

  it("forgetting an account the device never had changes nothing", () => {
    useMyAccounts.getState().remember(account);
    useMyAccounts.getState().forget("someone-elses-account");

    expect(useMyAccounts.getState().accounts).toEqual([account]);
  });
});
