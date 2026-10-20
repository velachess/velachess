import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { SourceId } from "./sources.ts";

/** "Mine" is a device fact, not a server fact — platform usernames are public. Cleared with site data; re-import just upserts. */
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
 * `persist` hydrates from storage on its own; there is no migration from
 * an older key. This list is a convenience — which accounts this browser
 * has seen — and the server remains the record. Losing it costs one
 * re-import, which upserts, so carrying a compatibility path for a key
 * that only ever existed on a handful of pre-release machines would be
 * dead code with a name on it.
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
