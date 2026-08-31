// @vitest-environment node
import { describe, expect, it } from "vitest";

import { extractRepertoireLines } from "../extract.ts";

const game = (sans: string[], openingName?: string | null) => ({
  sans,
  openingName: openingName ?? null,
});

describe("extractRepertoireLines", () => {
  it("a single shared line with support becomes one chapter", () => {
    const lines = extractRepertoireLines([
      game(["e4", "e6", "d4", "d5"]),
      game(["e4", "e6", "d4", "d5"]),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.sans).toEqual(["e4", "e6", "d4", "d5"]);
    expect(lines[0]!.gameCount).toBe(2);
  });

  it("a supported branch splits into its own line, ordered by frequency", () => {
    const lines = extractRepertoireLines([
      game(["e4", "e6", "d4"]),
      game(["e4", "e6", "d4"]),
      game(["e4", "e6", "d4"]),
      game(["e4", "c5", "Nf3"]),
      game(["e4", "c5", "Nf3"]),
    ]);
    expect(lines.map((l) => l.sans)).toEqual([
      ["e4", "e6", "d4"],
      ["e4", "c5", "Nf3"],
    ]);
    expect(lines.map((l) => l.gameCount)).toEqual([3, 2]);
  });

  it("the book stops where support drops below minGames", () => {
    const lines = extractRepertoireLines([
      game(["e4", "e6", "d4", "d5", "Nc3"]),
      game(["e4", "e6", "d4", "d5", "e5"]), // diverges at ply 5 with 1 game each
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.sans).toEqual(["e4", "e6", "d4", "d5"]);
  });

  it("maxPlies caps the book depth", () => {
    const long = ["e4", "e6", "d4", "d5", "Nc3", "Bb4", "e5", "c5"];
    const lines = extractRepertoireLines([game(long), game(long)], { maxPlies: 4 });
    expect(lines[0]!.sans).toEqual(["e4", "e6", "d4", "d5"]);
  });

  it("no prefix with support → no lines; empty mainlines are ignored", () => {
    expect(extractRepertoireLines([game(["e4"]), game(["d4"])])).toEqual([]);
    expect(extractRepertoireLines([game([]), game([])])).toEqual([]);
  });

  it("minGames: 1 keeps every full line", () => {
    const lines = extractRepertoireLines([game(["e4", "e5"]), game(["d4", "d5"])], {
      minGames: 1,
    });
    expect(lines.map((l) => l.sans)).toEqual([
      ["d4", "d5"],
      ["e4", "e5"],
    ]); // tie on count → deterministic SAN order
  });

  it("names by dominant opening among supporters, falling back to Line N", () => {
    const lines = extractRepertoireLines([
      game(["e4", "e6", "d4"], "French Defense"),
      game(["e4", "e6", "d4"], "French Defense"),
      game(["e4", "e6", "d4"], "French Defense: Advance"),
      game(["d4", "d5", "Bf4"]),
      game(["d4", "d5", "Bf4"]),
    ]);
    expect(lines.find((l) => l.sans[0] === "e4")?.name).toBe("French Defense");
    expect(lines.find((l) => l.sans[0] === "d4")?.name).toMatch(/^Line \d$/);
  });

  it("uses the already-resolved opening name from normalization", () => {
    const lines = extractRepertoireLines([
      game(["e4", "c5"], "Closed Sicilian Defense Grand Prix Attack"),
      game(["e4", "c5"], "Closed Sicilian Defense Grand Prix Attack"),
    ]);
    expect(lines[0]!.name).toBe("Closed Sicilian Defense Grand Prix Attack");
  });

  it("is deterministic across calls", () => {
    const games = [
      game(["e4", "e6", "d4"]),
      game(["e4", "e6", "d4"]),
      game(["e4", "c5", "Nf3"]),
      game(["e4", "c5", "Nc3"]),
      game(["e4", "c5", "Nf3"]),
    ];
    const a = extractRepertoireLines(games);
    const b = extractRepertoireLines(games);
    expect(a).toEqual(b);
  });
});
