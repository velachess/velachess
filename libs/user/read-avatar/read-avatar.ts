/**
 * No key parameter is the isolation guarantee: the key derives from the
 * authenticated user id, so no caller can name someone else's object and
 * there is no check to forget.
 */
import {
  avatarStorageKey,
  sniffAvatarMediaType,
  type AvatarMediaType,
} from "../avatar.ts";

/**
 * `Uint8Array<ArrayBuffer>` rather than the bare `Uint8Array` that widens
 * to `ArrayBufferLike`, which is what lets the route hand these bytes to a
 * Response without a cast or a copy.
 */
type GetAvatarObject = (key: string) => Promise<Uint8Array<ArrayBuffer> | null>;

export interface ReadAvatarDeps {
  getAvatarObject: GetAvatarObject;
}

export interface StoredAvatar {
  bytes: Uint8Array<ArrayBuffer>;
  mediaType: AvatarMediaType;
}

export async function readAvatar(
  deps: ReadAvatarDeps,
  userId: string,
): Promise<StoredAvatar | null> {
  const bytes = await deps.getAvatarObject(avatarStorageKey(userId));
  if (bytes === null) return null;

  // Sniffed on the way out too, so bytes that reached the store by some
  // other route get no Content-Type invented for them.
  const mediaType = sniffAvatarMediaType(bytes);
  if (mediaType === null) return null;

  return { bytes, mediaType };
}
