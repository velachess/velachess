/**
 * Refusals are returned, not thrown: an image the browser encoded badly is
 * an answer the route maps to a 4xx.
 */
import {
  AVATAR_MAX_BYTES,
  avatarStorageKey,
  avatarUrl,
  sniffAvatarMediaType,
} from "../avatar.ts";

type PutAvatarObject = (key: string, bytes: Uint8Array) => Promise<void>;
type WriteAvatarState = (
  userId: string,
  next: { image: string; avatarSource: "custom" },
) => Promise<void>;

export interface SetAvatarDeps {
  putAvatarObject: PutAvatarObject;
  writeAvatarState: WriteAvatarState;
}

export type SetAvatarOutcome =
  | { status: "saved"; image: string }
  | { status: "rejected"; reason: "unsupported-format" | "too-large" };

export async function setAvatar(
  deps: SetAvatarDeps,
  userId: string,
  bytes: Uint8Array,
): Promise<SetAvatarOutcome> {
  if (bytes.byteLength > AVATAR_MAX_BYTES) {
    return { status: "rejected", reason: "too-large" };
  }

  // From the bytes, not from anything the caller said about them.
  if (sniffAvatarMediaType(bytes) === null) {
    return { status: "rejected", reason: "unsupported-format" };
  }

  // Bytes first: a failed row write leaves an object the next upload
  // overwrites, where the reverse order shows a broken image until the
  // retry.
  await deps.putAvatarObject(avatarStorageKey(userId), bytes);

  const image = avatarUrl(Date.now());
  await deps.writeAvatarState(userId, { image, avatarSource: "custom" });

  return { status: "saved", image };
}
