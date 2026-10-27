import { accountIsTracked } from "./handlers/accounts.ts";
import {
  useMyAccounts,
  useSourceStore,
  type RememberedAccount,
} from "../games/import/index.ts";
import { useSoundPreferences } from "../chess-sounds/index.ts";
import { useSidebarStore } from "../app-shell/sidebar-store.ts";
import { archiveAccount } from "./archive.ts";

export function resetDevice(): void {
  localStorage.clear();
  useMyAccounts.setState(useMyAccounts.getInitialState(), true);
  useSourceStore.setState(useSourceStore.getInitialState(), true);
  useSoundPreferences.setState(useSoundPreferences.getInitialState(), true);
  useSidebarStore.setState(useSidebarStore.getInitialState(), true);
}

export function deviceHasImported(): RememberedAccount {
  const account = archiveAccount();
  accountIsTracked({
    id: account.id,
    platform: account.platform,
    username: account.username,
  });
  const remembered: RememberedAccount = {
    accountId: account.id,
    platform: account.platform,
    username: account.username,
  };

  useMyAccounts.getState().remember(remembered);
  return remembered;
}
