/**
 * ReadAvatar — the bytes of this user's own avatar.
 *
 * There is no key parameter, and that is the isolation guarantee: the key
 * is derived from the authenticated user id, so no caller can name
 * someone else's object and there is no check anyone can forget.
 */
import {
  avatarStorageKey,
  sniffAvatarMediaType,
  type AvatarMediaType,
} from "../avatar.ts";

type GetAvatarObject = (key: string) => Promise<Uint8Array | null>;

export interface ReadAvatarDeps {
  getAvatarObject: GetAvatarObject;
}

export interface StoredAvatar {
  bytes: Uint8Array;
  mediaType: AvatarMediaType;
}

export async function readAvatar(
  deps: ReadAvatarDeps,
  userId: string,
): Promise<StoredAvatar | null> {
  const bytes = await deps.getAvatarObject(avatarStorageKey(userId));
  if (bytes === null) return null;

  // Sniffed on the way out as well as in. Bytes that reached the store by
  // some other route — a file placed by hand, a restored backup — get no
  // Content-Type invented for them; they read as no avatar at all.
  const mediaType = sniffAvatarMediaType(bytes);
  if (mediaType === null) return null;

  return { bytes, mediaType };
}
