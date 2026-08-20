/**
 * Splits a PGN blob into one string per game. A new game's tag section
 * always starts with a line beginning `[Event `, so that's the split point —
 * works regardless of how many blank lines separate games.
 */
export function splitPgnGames(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  return trimmed
    .split(/\n(?=\[Event )/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}
