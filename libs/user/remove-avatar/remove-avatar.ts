/**
 * RemoveAvatar — drop this user's picture back to their initials.
 *
 * `none` rather than `null` is the whole point: it records that the user
 * chose to have no picture, which a later OAuth sign-in must not undo.
 */
import { avatarStorageKey } from "../avatar.ts";

type RemoveAvatarObject = (key: string) => Promise<void>;
type WriteAvatarState = (
  userId: string,
  next: { image: null; avatarSource: "none" },
) => Promise<void>;

export interface RemoveAvatarDeps {
  removeAvatarObject: RemoveAvatarObject;
  writeAvatarState: WriteAvatarState;
}

export async function removeAvatar(
  deps: RemoveAvatarDeps,
  userId: string,
): Promise<void> {
  // Row first, bytes second — the opposite of setAvatar, for the same
  // reason. Here the row is what the user sees, so clearing it first
  // means a failing unlink leaves an orphaned object rather than an
  // avatar that refuses to disappear.
  await deps.writeAvatarState(userId, { image: null, avatarSource: "none" });
  await deps.removeAvatarObject(avatarStorageKey(userId));
}
