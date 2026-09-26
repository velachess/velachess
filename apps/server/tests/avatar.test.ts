/**
 * The avatar surface, through the real app: real Better Auth, real
 * migrations, a real file store over a temp directory. Nothing is mocked,
 * so a passing test has moved actual bytes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AVATAR_MAX_BYTES } from "@velachess/user";

import { createApiHarness, type ApiHarness } from "./harness.ts";

let harness: ApiHarness;

beforeAll(async () => {
  harness = await createApiHarness();
});

afterAll(async () => {
  await harness.close();
});

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** A 1x1 WebP, the smallest thing that satisfies the magic-byte sniff. */
const WEBP = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
  0x38, 0x4c, 0x0d, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00, 0x10, 0x07, 0x10, 0x11,
  0x11, 0x88, 0x88, 0xfe, 0x07, 0x00,
]);

const base64 = (bytes: Buffer) => bytes.toString("base64");

/** A second, distinguishable image — a 1x1 PNG. */
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
  0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
  0x00, 0x1f, 0x15, 0xc4, 0x89,
]);

async function sessionImage(owner: {
  request: (input: string, init?: RequestInit) => Promise<Response>;
}) {
  const response = await owner.request("/auth/get-session");
  const body = (await response.json()) as { user?: { image?: string | null } } | null;
  return body?.user?.image ?? null;
}

describe("setting an avatar", () => {
  it("stores it, reports the URL, and serves the same bytes back", async () => {
    const { app: owner } = await harness.signUp("avatar-roundtrip@test.local");

    const saved = await owner.request("/me/avatar", json({ image: base64(WEBP) }));
    expect(saved.status).toBe(200);
    const { image } = (await saved.json()) as { image: string };
    expect(image).toMatch(/^\/api\/me\/avatar\?v=\d+$/);

    const served = await owner.request("/me/avatar");
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/webp");
    expect(Buffer.from(await served.arrayBuffer())).toEqual(WEBP);
  });

  /**
   * The one test whose failure means the feature is invisible however green
   * everything else is: the SPA reads the avatar off Better Auth's session,
   * not off our API, so the URL has to land on the user row.
   */
  it("puts the URL on the session Better Auth serves", async () => {
    const { app: owner } = await harness.signUp("avatar-session@test.local");

    expect(await sessionImage(owner)).toBeNull();

    const saved = await owner.request("/me/avatar", json({ image: base64(WEBP) }));
    const { image } = (await saved.json()) as { image: string };

    expect(await sessionImage(owner)).toBe(image);
  });

  it("replaces in place, and the new URL differs from the old", async () => {
    const { app: owner } = await harness.signUp("avatar-replace@test.local");

    const first = await owner.request("/me/avatar", json({ image: base64(WEBP) }));
    const { image: firstUrl } = (await first.json()) as { image: string };

    // A different format, so the served content-type proves the replacement
    // happened rather than the read hitting a stale object.
    const second = await owner.request("/me/avatar", json({ image: base64(PNG) }));
    const { image: secondUrl } = (await second.json()) as { image: string };

    expect(secondUrl).not.toBe(firstUrl);

    const served = await owner.request("/me/avatar");
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await served.arrayBuffer())).toEqual(PNG);
  });

  it("carries the cache and isolation headers a shared cache needs", async () => {
    const { app: owner } = await harness.signUp("avatar-headers@test.local");
    await owner.request("/me/avatar", json({ image: base64(WEBP) }));

    const served = await owner.request("/me/avatar");

    // `private` and `Vary: Cookie` are the pair that stops a shared cache
    // answering one user with another's face; `immutable` is only safe
    // because the URL carries a version.
    expect(served.headers.get("cache-control")).toContain("private");
    expect(served.headers.get("cache-control")).toContain("immutable");
    expect(served.headers.get("vary")).toContain("Cookie");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("refusing an avatar", () => {
  it("refuses a data: prefix as a malformed body", async () => {
    const { app: owner } = await harness.signUp("avatar-dataurl@test.local");

    const response = await owner.request(
      "/me/avatar",
      json({ image: `data:image/webp;base64,${base64(WEBP)}` }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid body" });
  });

  /** Valid base64, valid JSON, and not an image — the case the declared
   * Content-Type cannot be trusted to catch. */
  it("refuses markup whatever it is wrapped in", async () => {
    const { app: owner } = await harness.signUp("avatar-svg@test.local");

    const response = await owner.request(
      "/me/avatar",
      json({ image: Buffer.from('<svg onload="alert(1)"/>').toString("base64") }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "unsupported image format" });
  });

  it("refuses an image over the avatar ceiling", async () => {
    const { app: owner } = await harness.signUp("avatar-toobig@test.local");
    const oversized = Buffer.concat([
      WEBP,
      Buffer.alloc(AVATAR_MAX_BYTES - WEBP.length + 1),
    ]);

    const response = await owner.request(
      "/me/avatar",
      json({ image: base64(oversized) }),
    );

    expect(response.status).toBe(413);
  });

  /** Proof the global MAX_BODY_BYTES was not raised to make room for
   * avatars: a payload past it dies before the route sees it. */
  it("still enforces the global body limit", async () => {
    const { app: owner } = await harness.signUp("avatar-bodylimit@test.local");

    const response = await owner.request(
      "/me/avatar",
      json({ image: "A".repeat(300 * 1024) }),
    );

    expect(response.status).toBe(413);
  });

  it("answers 404 before anything has been uploaded", async () => {
    const { app: owner } = await harness.signUp("avatar-empty@test.local");

    const response = await owner.request("/me/avatar");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "no avatar" });
  });
});

describe("who may see an avatar", () => {
  /** The key is derived from the session's user id, so one user's read can
   * never reach another's object. */
  it("serves each user only their own", async () => {
    const { app: a } = await harness.signUp("avatar-isolation-a@test.local");
    const { app: b } = await harness.signUp("avatar-isolation-b@test.local");

    await a.request("/me/avatar", json({ image: base64(WEBP) }));
    await b.request("/me/avatar", json({ image: base64(PNG) }));

    expect(Buffer.from(await (await a.request("/me/avatar")).arrayBuffer())).toEqual(
      WEBP,
    );
    expect(Buffer.from(await (await b.request("/me/avatar")).arrayBuffer())).toEqual(PNG);
  });

  it("refuses every verb without a session", async () => {
    const get = await harness.app.request("/me/avatar");
    const post = await harness.app.request("/me/avatar", json({ image: base64(WEBP) }));
    const remove = await harness.app.request("/me/avatar", { method: "DELETE" });

    expect([get.status, post.status, remove.status]).toEqual([401, 401, 401]);
  });
});

describe("removing an avatar", () => {
  it("clears the session image, stops serving, and repeats safely", async () => {
    const { app: owner } = await harness.signUp("avatar-remove@test.local");
    await owner.request("/me/avatar", json({ image: base64(WEBP) }));

    const removed = await owner.request("/me/avatar", { method: "DELETE" });
    expect(removed.status).toBe(204);

    expect(await sessionImage(owner)).toBeNull();
    expect((await owner.request("/me/avatar")).status).toBe(404);

    const again = await owner.request("/me/avatar", { method: "DELETE" });
    expect(again.status).toBe(204);
  });

  it("removes cleanly for a user who never had one", async () => {
    const { app: owner } = await harness.signUp("avatar-remove-none@test.local");

    const response = await owner.request("/me/avatar", { method: "DELETE" });

    expect(response.status).toBe(204);
  });
});
