import { describe, expect, it } from "vitest";

import {
  AVATAR_MAX_BYTES,
  avatarStorageKey,
  avatarUrl,
  isStoredAvatar,
  sniffAvatarMediaType,
} from "../avatar.ts";

const webp = () =>
  new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56]);
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

describe("sniffAvatarMediaType", () => {
  it("recognises the three formats we accept", () => {
    expect(sniffAvatarMediaType(webp())).toBe("image/webp");
    expect(sniffAvatarMediaType(jpeg())).toBe("image/jpeg");
    expect(sniffAvatarMediaType(png())).toBe("image/png");
  });

  /** The reason this function exists: a caller claiming `image/png` over
   * markup must get no avatar, whatever the Content-Type said. */
  it("refuses markup that a Content-Type could dress up as an image", () => {
    const svg = new TextEncoder().encode('<svg onload="alert(1)"/>');
    const html = new TextEncoder().encode("<!doctype html><script>");

    expect(sniffAvatarMediaType(svg)).toBeNull();
    expect(sniffAvatarMediaType(html)).toBeNull();
  });

  /** "RIFF" alone is a container, not a format — a WAV file starts the
   * same way, so the form type at byte 8 has to match too. */
  it("refuses a RIFF container that is not WEBP", () => {
    const wav = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
    ]);

    expect(sniffAvatarMediaType(wav)).toBeNull();
  });

  it("refuses bytes too short to carry a signature", () => {
    expect(sniffAvatarMediaType(new Uint8Array())).toBeNull();
    expect(sniffAvatarMediaType(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
    // A RIFF header that stops before the form type.
    expect(
      sniffAvatarMediaType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0])),
    ).toBeNull();
  });
});

describe("addressing", () => {
  /** One key per user, so replacing an avatar overwrites rather than
   * leaving an object nobody will collect. */
  it("derives one fixed key per user", () => {
    expect(avatarStorageKey("d3b07384-d9a0-4c9b-8f4e-000000000001")).toBe(
      "avatars/d3b07384-d9a0-4c9b-8f4e-000000000001.webp",
    );
  });

  it("builds a browser path with a cache buster and no user id", () => {
    const url = avatarUrl(1_700_000_000_000);

    expect(url).toBe("/api/me/avatar?v=1700000000000");
    expect(url).not.toContain("avatars/");
  });

  it("tells our own URLs from a provider's", () => {
    expect(isStoredAvatar("/api/me/avatar?v=1")).toBe(true);
    expect(isStoredAvatar("https://lh3.googleusercontent.com/a/xyz")).toBe(false);
    expect(isStoredAvatar(null)).toBe(false);
  });
});

describe("the size ceiling", () => {
  /** Base64 inflates by a third, so the ceiling has to leave room under
   * the API's 256 KB body limit rather than sit at it. */
  it("leaves room for base64 under a 256 KB body limit", () => {
    expect(Math.ceil((AVATAR_MAX_BYTES * 4) / 3)).toBeLessThan(256 * 1024);
  });
});
