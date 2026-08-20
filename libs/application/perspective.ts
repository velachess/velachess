/**
 * Which side is "you" in a game. Stored perspective wins (pasted PGNs can
 * declare it); synced games derive it from the tracked account username
 * vs the player names — the normalizer can't know who "you" are, the
 * tracked account can. Null = not determinable, not judgeable.
 */

export interface PerspectiveSource {
  /** Enum column arrives as string from drizzle — narrowing happens here. */
  perspective: string | null;
  whiteName: string;
  blackName: string;
  accountUsername: string;
}

export function resolveGamePerspective(
  game: PerspectiveSource,
): "white" | "black" | null {
  if (game.perspective === "white" || game.perspective === "black")
    return game.perspective;
  const username = game.accountUsername.toLowerCase();
  if (game.whiteName.toLowerCase() === username) return "white";
  if (game.blackName.toLowerCase() === username) return "black";
  return null;
}
