/**
 * The opening family a game belongs to, from what its platform sent.
 *
 * The two platforms disagree about naming. Lichess sends a full
 * `Opening` header — "Sicilian Defense: Najdorf Variation" — where the
 * family sits before the colon. Chess.com sends no `Opening` at all:
 * the name is buried in `ECOUrl` as a slug,
 * "…/openings/Sicilian-Defense-Bowdler-Attack-2.Bc4-e6", family first,
 * variation and moves after. Aggregating on either raw form scatters
 * one opening across dozens of buckets a five-game floor can never
 * fill; the family is the level a person means when they say "I keep
 * losing in the Sicilian".
 *
 * The slug heuristic: words up to and including the first family marker
 * (Defense, Opening, Game, Gambit, Attack, System, Variation), stopping
 * early at anything that looks like a move. Unknown shapes fall back to
 * at most the first three words — a name too specific beats none.
 */

const FAMILY_MARKERS = new Set([
  "defense",
  "defence",
  "opening",
  "game",
  "gambit",
  "attack",
  "system",
  "variation",
]);

/**
 * The move tail of a chess.com slug always opens with a numbered white
 * move — "2.Bc4", "4.O-O" — so a token leading with a digit is where the
 * name ends. Unnumbered black moves ("e6") only ever follow one.
 */
const MOVE_TOKEN = /^\d/;

const FALLBACK_WORDS = 3;

export function openingFamily(name: string | null, ecoUrl: string | null): string | null {
  if (name) {
    // Lichess: family before the colon; already the answer without one.
    const family = name.split(":")[0]!.trim();
    return family.length > 0 ? family : null;
  }

  if (!ecoUrl) return null;
  const slug = ecoUrl.split("/").filter(Boolean).pop();
  if (!slug) return null;

  const words: string[] = [];
  for (const token of slug.split("-")) {
    if (MOVE_TOKEN.test(token)) break;
    words.push(token);
    if (FAMILY_MARKERS.has(token.toLowerCase())) return words.join(" ");
  }

  if (words.length === 0) return null;
  return words.slice(0, FALLBACK_WORDS).join(" ");
}
