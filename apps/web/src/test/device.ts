import { accountIsTracked } from "./handlers/accounts.ts";
import { useMyAccounts, type RememberedAccount } from "../games/import/my-accounts.ts";
import { useSourceStore } from "../games/import/source-store.ts";
import { useSoundPreferences } from "../chess-sounds/index.ts";
import { archiveAccount } from "./archive.ts";

export function resetDevice(): void {
  localStorage.clear();
  useMyAccounts.setState(useMyAccounts.getInitialState(), true);
  useSourceStore.setState(useSourceStore.getInitialState(), true);
  useSoundPreferences.setState(useSoundPreferences.getInitialState(), true);
}

/** Puts the device in the post-import state so `_app` lets it through, without routing every test through the import form. */
export function deviceHasImported(): RememberedAccount {
  const account = archiveAccount();
  // The server's side of the same fact — the dashboard asks it, not the device.
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
