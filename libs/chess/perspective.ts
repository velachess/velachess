/**
 * Which side is "you" in a game. Stored perspective wins; otherwise your
 * handles are matched against the player names. Null = not determinable,
 * which is a fact about an unattributed game, not a gap to paper over.
 *
 * One rule, two callers with different evidence: a server read hands it
 * one username, the review screen every handle the device remembers.
 * `libs/infra/db` repeats it as a SQL predicate because a predicate
 * cannot call this, and its tests pin the two together.
 */

export interface SeatSource {
  /** Stored as an enum column, so it arrives as a string — narrowing happens here. */
  perspective: string | null;
  whiteName: string;
  blackName: string;
}

/** Black before white, which only matters for a game you played against
 * yourself: the answer has always been black. */
export function resolveGamePerspective(
  game: SeatSource,
  /** The handles that are yours. A single account username is a list of one. */
  handles: readonly (string | null | undefined)[],
): "white" | "black" | null {
  if (game.perspective === "white" || game.perspective === "black")
    return game.perspective;

  const mine = new Set(
    handles.filter((handle): handle is string => Boolean(handle)).map(lower),
  );
  if (mine.size === 0) return null;

  if (mine.has(lower(game.blackName))) return "black";
  if (mine.has(lower(game.whiteName))) return "white";
  return null;
}

/** Case folded and nothing else: the SQL predicate compares
 * `lower(name) = lower(username)`, so trimming here would disagree. */
function lower(name: string): string {
  return name.toLowerCase();
}
