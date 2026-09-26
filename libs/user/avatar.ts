/**
 * Avatar rules that hold no matter who is asking: what an avatar may be,
 * where its bytes live, and how the browser addresses it. Pure, so every
 * slice imports it directly rather than declaring a dependency for it.
 */

/**
 * 128 KB after a 512x512 re-encode is generous — the client lands well
 * under it — and it leaves room under the API's 256 KB body limit even
 * after base64 inflates the payload by a third.
 */
export const AVATAR_MAX_BYTES = 128 * 1024;

export type AvatarMediaType = "image/webp" | "image/jpeg" | "image/png";

/** Written by us only: an upload, or a deliberate removal. A row with
 * neither was last touched by Better Auth's user creation. */
export type AvatarSource = "custom" | "none";

const MAGIC: ReadonlyArray<{
  type: AvatarMediaType;
  matches: (b: Uint8Array) => boolean;
}> = [
  {
    type: "image/webp",
    // RIFF container, then the form type at byte 8. Checking only
    // "RIFF" would accept a WAV file.
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
 * The media type the bytes actually are, or `null` for anything else.
 * Never reads a declared Content-Type: a client claiming `image/png` over
 * `<svg onload=…>` is exactly the case this exists to refuse, and the
 * same answer serves the read path so a stored object and the type we
 * serve it as cannot disagree.
 */
export function sniffAvatarMediaType(bytes: Uint8Array): AvatarMediaType | null {
  return MAGIC.find((candidate) => candidate.matches(bytes))?.type ?? null;
}

/**
 * One key per user, overwritten in place. That is what keeps the orphan
 * class empty: replacing an avatar needs no delete, so there is never a
 * second object to forget about. The extension is fixed because the
 * client always encodes WebP.
 */
export function avatarStorageKey(userId: string): string {
  return `avatars/${userId}.webp`;
}

/**
 * Carries no user id: the read route resolves the session and serves that
 * user's own object, so there is nothing addressable to enumerate. The
 * `/api` prefix is the path the browser sees — Vite rewrites it in
 * development and the reverse proxy maps it in production — the same
 * reason `GOOGLE_CALLBACK_PATH` in libs/infra/auth/auth.ts carries it.
 *
 * `version` is a cache buster, which is what lets the served bytes be
 * `immutable`: a new upload produces a new URL rather than asking every
 * cache to revalidate the old one.
 *
 * Mirrors the route mounted in apps/server/src/routes/user.ts.
 */
export function avatarUrl(version: number): string {
  return `/api/me/avatar?v=${version}`;
}
