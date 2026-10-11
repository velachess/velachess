/**
 * Which side is "you" in a game. Stored perspective wins (a manual PGN
 * import resolved it per game); otherwise the handles that are yours are
 * matched against the player names — the normalizer cannot know who
 * "you" are, a tracked handle can. Null = not determinable, which is a
 * fact about an unattributed game, not a gap to paper over.
 *
 * Lives here so every module that needs it can import a pure,
 * dependency-free function without reaching into another module's
 * package. One rule, two callers with different evidence: a server read
 * hands it the provenance account's single username, and the review
 * screen hands it every handle the device remembers.
 *
 * `libs/infra/db` expresses the same rule as a SQL predicate
 * (`queries/perspective.ts`) because a predicate cannot call this — see
 * that file, and the database tests that pin it.
 */

export interface SeatSource {
  /** Stored as an enum column, so it arrives as a string — narrowing happens here. */
  perspective: string | null;
  whiteName: string;
  blackName: string;
}

/**
 * Black is checked before white, which only matters for a game you
 * played against yourself: both names match a handle of yours, and the
 * answer has always been black. Preserved deliberately rather than
 * relitigated while moving the rule.
 */
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

/**
 * Case folded and nothing else. The SQL predicate that expresses this
 * same rule compares `lower(name) = lower(username)`, so trimming here
 * would make the screen match a padded handle the library's filter
 * would not — a new disagreement, in the exact place this change exists
 * to remove one.
 */
function lower(name: string): string {
  return name.toLowerCase();
}
