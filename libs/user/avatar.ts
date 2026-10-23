/**
 * Pure, so every slice imports it directly rather than declaring a
 * dependency for it.
 */

/**
 * Leaves room under the API's 256 KB body limit even after base64 inflates
 * the payload by a third.
 */
export const AVATAR_MAX_BYTES = 128 * 1024;

export type AvatarMediaType = "image/webp" | "image/jpeg" | "image/png";

/** A row with neither was last touched by Better Auth's user creation. */
export type AvatarSource = "custom" | "none";

const MAGIC: ReadonlyArray<{
  type: AvatarMediaType;
  matches: (b: Uint8Array) => boolean;
}> = [
  {
    type: "image/webp",
    // The form type at byte 8 too: "RIFF" alone accepts a WAV file.
    matches: (b) =>
      b.length >= 12 &&
      startsWith(b, [0x52, 0x49, 0x46, 0x46], 0) &&
      startsWith(b, [0x57, 0x45, 0x42, 0x50], 8),
  },
  {
    type: "image/jpeg",
    matches: (b) => startsWith(b, [0xff, 0xd8, 0xff], 0),
  },
  {
    type: "image/png",
    matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0),
  },
];

function startsWith(bytes: Uint8Array, expected: number[], offset: number): boolean {
  if (bytes.length < offset + expected.length) return false;
  return expected.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * Never reads a declared Content-Type: a client claiming `image/png` over
 * `<svg onload=…>` is the case this refuses. The same answer serves the
 * read path, so a stored object and the type it is served as agree.
 */
export function sniffAvatarMediaType(bytes: Uint8Array): AvatarMediaType | null {
  return MAGIC.find((candidate) => candidate.matches(bytes))?.type ?? null;
}

/**
 * One key per user, overwritten in place, so replacing an avatar needs no
 * delete and leaves no orphan. The extension is fixed because the client
 * always encodes WebP.
 */
export function avatarStorageKey(userId: string): string {
  return `avatars/${userId}.webp`;
}

/**
 * Carries no user id: the read route resolves the session and serves that
 * user's own object, so there is nothing to enumerate. The `/api` prefix is
 * the path the browser sees, like `GOOGLE_CALLBACK_PATH`.
 *
 * `version` is the cache buster that lets the bytes be served `immutable`:
 * a new upload produces a new URL instead of a revalidation.
 */
export function avatarUrl(version: number): string {
  return `/api/me/avatar?v=${version}`;
}
