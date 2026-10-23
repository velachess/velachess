import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { SourceId } from "./sources.ts";

/** "Mine" is a device fact, not a server one: platform usernames are
 * public. Cleared with site data, and a re-import upserts. */
export interface RememberedAccount {
  accountId: string;
  platform: SourceId;
  username: string;
}

interface MyAccountsStore {
  accounts: RememberedAccount[];
  remember: (account: RememberedAccount) => void;
  forget: (accountId: string) => void;
}

const MY_ACCOUNTS_STORAGE_KEY = "velachess.my-accounts";

/**
 * `persist` hydrates on its own and there is no migration from an older
 * key: the server is the record, and losing this list costs one re-import,
 * which upserts.
 */
export const useMyAccounts = create<MyAccountsStore>()(
  persist(
    (set) => ({
      accounts: [],
      remember: (account) =>
        set((state) => ({
          accounts: [
            ...state.accounts.filter(({ accountId }) => accountId !== account.accountId),
            account,
          ],
        })),
      forget: (accountId) =>
        set((state) => ({
          accounts: state.accounts.filter((account) => account.accountId !== accountId),
        })),
    }),
    { name: MY_ACCOUNTS_STORAGE_KEY, version: 1 },
  ),
);
