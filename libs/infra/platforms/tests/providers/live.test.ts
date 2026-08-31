/**
 * Real network, opt-in. Verified reachable live from this environment while
 * designing this package — skipped by default so a network-less CI run
 * stays green. Run with: VELACHESS_LIVE=1 pnpm test -- live.test.ts
 */

import { describe, expect, it } from "vitest";

import { fetchChessCom, fetchLichess } from "@velachess/infra-platforms";

const isLive = process.env["VELACHESS_LIVE"] === "1";
const describeLive = isLive ? describe : describe.skip;

describeLive("real Chess.com API", () => {
  it("fetches and normalizes a real month of games for a known public account", async () => {
    const result = await fetchChessCom("test-player", null, {});
    expect(result.games.length).toBeGreaterThan(0);
    expect(result.games[0]?.source).toBe("chess_com");
    expect(result.games[0]?.rawPgn).toContain("[Event ");
    expect(result.cursor).not.toBeNull();
  }, 30_000);
});

describeLive("real Lichess API", () => {
  it("fetches and normalizes real games via the raw PGN export endpoint", async () => {
    const result = await fetchLichess("DrNykterstein", null, {});
    expect(result.games.length).toBeGreaterThan(0);
    expect(result.games[0]?.source).toBe("lichess");
    expect(result.games[0]?.rawPgn).toContain("[Event ");
  }, 30_000);
});
