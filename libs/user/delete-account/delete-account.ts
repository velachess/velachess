import { avatarStorageKey } from "../avatar.ts";

type RemoveAvatarObject = (key: string) => Promise<void>;
/** The user row and everything it owns, atomically. */
type DeleteUser = (userId: string) => Promise<void>;

export interface DeleteAccountDeps {
  removeAvatarObject: RemoveAvatarObject;
  deleteUser: DeleteUser;
}

export async function deleteAccount(
  deps: DeleteAccountDeps,
  userId: string,
): Promise<void> {
  // Bytes first: a failing unlink leaves the account whole and the request
  // retryable, where the reverse orphans a file nobody can reach again.
  await deps.removeAvatarObject(avatarStorageKey(userId));
  await deps.deleteUser(userId);
}
