/**
 * The payloads below are trimmed copies of real responses, captured with
 * curl on 17/08/2026 (Lichess flair re-captured 23/08/2026 off
 * DrNykterstein, whose santa flair the earlier capture predated).
 * Invented fixtures would have missed the things that actually matter
 * here: that `country` is a link, that `location` is a different,
 * free-text field that does not agree with it, and that `flair` is an
 * asset id at the top level, not part of `profile`.
 */
import { describe, expect, it } from "vitest";

import {
  countryCodeFromUrl,
  type ProfileFetch,
  fetchChessComProfile,
  fetchLichessProfile,
} from "../providers/profile.ts";

/** Narrows the union for field assertions — a failed ask fails loudly here
 * instead of producing misleading undefined-field mismatches below. */
function fetchedProfile(result: ProfileFetch) {
  if (result.status !== "fetched")
    throw new Error(`expected fetched, got ${result.status}`);
  return result.profile;
}

async function fetchedChessCom(username: string, fetch: typeof globalThis.fetch) {
  return fetchedProfile(await fetchChessComProfile(username, { fetch }));
}

async function fetchedLichess(username: string, fetch: typeof globalThis.fetch) {
  return fetchedProfile(await fetchLichessProfile(username, { fetch }));
}

function respondWith(body: unknown, ok = true): typeof globalThis.fetch {
  return (async () =>
    ({
      ok,
      status: ok ? 200 : 404,
      json: async () => body,
    }) as Response) as typeof globalThis.fetch;
}

const CHESS_COM_REAL = {
  avatar:
    "https://images.chesscomfiles.com/uploads/v1/user/461825478.97ae265f.200x200o.5fa38b32b080.jpg",
  player_id: 461_825_478,
  username: "yurimutti",
  country: "https://api.chess.com/pub/country/BR",
  // Declared as Brazil, sitting in Spain. The two disagree, and the flag
  // follows `country`.
  location: "Spain",
  status: "basic",
};

const LICHESS_REAL_EMPTY = {
  id: "yurimutti",
  username: "yurimutti",
  perfs: { blitz: { games: 0, rating: 1500 } },
  url: "https://lichess.org/@/yurimutti",
  // No `profile` key at all, and no image field anywhere.
};

const LICHESS_REAL_FLAIRED = {
  id: "drnykterstein",
  username: "DrNykterstein",
  title: "GM",
  flair: "people.santa-claus-light-skin-tone",
  profile: {},
  url: "https://lichess.org/@/DrNykterstein",
};

describe("countryCodeFromUrl", () => {
  it("takes the code off the end of the link Chess.com sends", () => {
    expect(countryCodeFromUrl("https://api.chess.com/pub/country/BR")).toBe("BR");
  });

  it("uppercases, so the value is one shape wherever it is stored", () => {
    expect(countryCodeFromUrl("https://api.chess.com/pub/country/br")).toBe("BR");
  });

  it("refuses anything that is not two letters", () => {
    expect(countryCodeFromUrl("https://api.chess.com/pub/country/")).toBeNull();
    expect(countryCodeFromUrl("https://api.chess.com/pub/country/BRA")).toBeNull();
    expect(countryCodeFromUrl(undefined)).toBeNull();
  });
});

describe("fetchChessComProfile", () => {
  it("reads the avatar and the country off a real response", async () => {
    const profile = await fetchedChessCom("yurimutti", respondWith(CHESS_COM_REAL));

    expect(profile.avatarUrl).toBe(CHESS_COM_REAL.avatar);
    expect(profile.countryCode).toBe("BR");
    // Chess.com has no flair concept — the field stays null for every account.
    expect(profile.flair).toBeNull();
  });

  it("does not mistake `location` for the country", async () => {
    // The captured account declares BR and sits in Spain. Reading
    // `location` would fly a Spanish flag over a Brazilian player.
    const profile = await fetchedChessCom(
      "yurimutti",
      respondWith({ ...CHESS_COM_REAL, country: undefined }),
    );

    expect(profile.countryCode).toBeNull();
  });

  it("answers an empty profile for an account with neither — an answer, not a failure", async () => {
    const profile = await fetchedChessCom(
      "someone",
      respondWith({ username: "someone" }),
    );

    expect(profile).toEqual({ avatarUrl: null, flair: null, countryCode: null });
  });

  it("reports failed on a 404 rather than throwing", async () => {
    // A profile decorates a name; failing here would take the game down
    // with it. Failed — not an empty answer — so cached identity stands.
    const result = await fetchChessComProfile("nobody", {
      fetch: respondWith(null, false),
    });

    expect(result).toEqual({ status: "failed" });
  });

  it("does not call out at all for a username that cannot exist", async () => {
    let called = false;
    const profile = await fetchedChessCom("!!bad!!", (async () => {
      called = true;
      return {} as Response;
    }) as typeof globalThis.fetch);

    expect(called).toBe(false);
    expect(profile.avatarUrl).toBeNull();
  });
});

describe("fetchLichessProfile", () => {
  it("has no avatar to report, because Lichess has none", async () => {
    const profile = await fetchedLichess("yurimutti", respondWith(LICHESS_REAL_EMPTY));

    expect(profile.avatarUrl).toBeNull();
  });

  it("reads the flag once the person has set one", async () => {
    const profile = await fetchedLichess(
      "someone",
      respondWith({ id: "someone", profile: { flag: "br" } }),
    );

    expect(profile.countryCode).toBe("BR");
  });

  it("reads the flair off a real response, where it sits at the top level", async () => {
    // Captured off DrNykterstein: `flair` is a sibling of `profile`, not
    // inside it, and it is an asset id rather than an image URL.
    const profile = await fetchedLichess(
      "DrNykterstein",
      respondWith(LICHESS_REAL_FLAIRED),
    );

    expect(profile.flair).toBe("people.santa-claus-light-skin-tone");
    expect(profile.avatarUrl).toBeNull();
  });

  it("comes back without a flair when none is set", async () => {
    const profile = await fetchedLichess("yurimutti", respondWith(LICHESS_REAL_EMPTY));

    expect(profile.flair).toBeNull();
  });

  it("ignores a flag that is not a country code", async () => {
    // Lichess also accepts region and custom flags like `_lichess`.
    const profile = await fetchedLichess(
      "someone",
      respondWith({ id: "someone", profile: { flag: "_lichess" } }),
    );

    expect(profile.countryCode).toBeNull();
  });

  it("fails soft when fetch rejects (network error)", async () => {
    const result = await fetchChessComProfile("someone", {
      fetch: async () => {
        throw new Error("network error");
      },
    });
    expect(result).toEqual({ status: "failed" });
  });

  it("treats an unreadable body as failed, not as an empty answer", async () => {
    const result = await fetchChessComProfile("someone", {
      fetch: async () =>
        Object.assign(
          {
            ok: true,
            json: async () => {
              throw new Error("bad json");
            },
          },
          {} as Response,
        ),
    });
    expect(result).toEqual({ status: "failed" });
  });

  it("reports failed when request is aborted", async () => {
    const result = await fetchLichessProfile("someone", {
      fetch: async () => {
        throw new DOMException("Aborted", "AbortError");
      },
    });
    expect(result).toEqual({ status: "failed" });
  });
});
