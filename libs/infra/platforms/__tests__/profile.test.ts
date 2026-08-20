/**
 * The payloads below are trimmed copies of real responses, captured with
 * curl on 17/08/2026. Invented fixtures would have missed the two things
 * that actually matter here: that `country` is a link, and that `location`
 * is a different, free-text field that does not agree with it.
 */
import { describe, expect, it } from "vitest";

import {
  countryCodeFromUrl,
  fetchChessComProfile,
  fetchLichessProfile,
} from "../providers/profile.ts";

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
    const profile = await fetchChessComProfile("yurimutti", {
      fetch: respondWith(CHESS_COM_REAL),
    });

    expect(profile.avatarUrl).toBe(CHESS_COM_REAL.avatar);
    expect(profile.countryCode).toBe("BR");
  });

  it("does not mistake `location` for the country", async () => {
    // The captured account declares BR and sits in Spain. Reading
    // `location` would fly a Spanish flag over a Brazilian player.
    const profile = await fetchChessComProfile("yurimutti", {
      fetch: respondWith({ ...CHESS_COM_REAL, country: undefined }),
    });

    expect(profile.countryCode).toBeNull();
  });

  it("comes back empty for an account with neither", async () => {
    const profile = await fetchChessComProfile("someone", {
      fetch: respondWith({ username: "someone" }),
    });

    expect(profile).toEqual({ avatarUrl: null, countryCode: null });
  });

  it("comes back empty rather than throwing on a 404", async () => {
    // A profile decorates a name; failing here would take the game down
    // with it.
    const profile = await fetchChessComProfile("nobody", {
      fetch: respondWith(null, false),
    });

    expect(profile).toEqual({ avatarUrl: null, countryCode: null });
  });

  it("does not call out at all for a username that cannot exist", async () => {
    let called = false;
    const profile = await fetchChessComProfile("!!bad!!", {
      fetch: (async () => {
        called = true;
        return {} as Response;
      }) as typeof globalThis.fetch,
    });

    expect(called).toBe(false);
    expect(profile.avatarUrl).toBeNull();
  });
});

describe("fetchLichessProfile", () => {
  it("has no avatar to report, because Lichess has none", async () => {
    const profile = await fetchLichessProfile("yurimutti", {
      fetch: respondWith(LICHESS_REAL_EMPTY),
    });

    expect(profile.avatarUrl).toBeNull();
  });

  it("reads the flag once the person has set one", async () => {
    const profile = await fetchLichessProfile("someone", {
      fetch: respondWith({ id: "someone", profile: { flag: "br" } }),
    });

    expect(profile.countryCode).toBe("BR");
  });

  it("ignores a flag that is not a country code", async () => {
    // Lichess also accepts region and custom flags like `_lichess`.
    const profile = await fetchLichessProfile("someone", {
      fetch: respondWith({ id: "someone", profile: { flag: "_lichess" } }),
    });

    expect(profile.countryCode).toBeNull();
  });
});
