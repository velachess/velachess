/**
 * Which side is "you" in a game. Stored perspective wins (a manual PGN
 * import resolved it per game); synced games derive it from the tracked
 * account username vs the player names — the normalizer can't know who
 * "you" are, the tracked account can. Null = not determinable, not
 * judgeable.
 *
 * Moved here (from libs/application/perspective.ts) so every business
 * module that needs it — games, repertoires, insights — can import a
 * pure, dependency-free function without reaching into another module's
 * package and risking a cross-module import cycle.
 */

export interface PerspectiveSource {
  /** Enum column arrives as string from drizzle — narrowing happens here. */
  perspective: string | null;
  whiteName: string;
  blackName: string;
  /** Absent on manually imported games — there is no handle behind them. */
  accountUsername: string | null;
}

export function resolveGamePerspective(
  game: PerspectiveSource,
): "white" | "black" | null {
  if (game.perspective === "white" || game.perspective === "black")
    return game.perspective;
  const username = game.accountUsername?.toLowerCase();
  if (!username) return null;
  if (game.whiteName.toLowerCase() === username) return "white";
  if (game.blackName.toLowerCase() === username) return "black";
  return null;
}
