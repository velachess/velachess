/**
 * Opening-name resolution from PGN metadata. Chess.com encodes the name
 * inside the ECOUrl slug instead of an [Opening] header — the URL is the
 * fallback name source. Lichess and manual PGNs carry an [Opening] header
 * directly. This module unifies both into a single resolution.
 *
 * This is provider-specific URL parsing, not chess-domain logic. The
 * resolved name is persisted during normalization; consumers like
 * repertoire extraction work with the canonical `openingName` field.
 */

/**
 * chess.com encodes the name in the ECOUrl slug:
 *   .../openings/Closed-Sicilian-Defense-Grand-Prix-Attack-3...g6-4.Bc4
 * → "Closed Sicilian Defense Grand Prix Attack". Move-like tokens (start
 * with a digit or an ellipsis) end the human-readable part.
 */
export function openingNameFrom(source: {
  name?: string | null | undefined;
  url?: string | null | undefined;
}): string | null {
  if (source.name) return source.name;
  if (!source.url) return null;

  const slug = source.url.split("/").findLast((segment) => segment.length > 0);
  if (!slug) return null;

  const words: string[] = [];
  for (const token of slug.split("-")) {
    if (/^\d/.test(token) || token.startsWith("...")) break; // moves begin
    if (token.length > 0) words.push(token);
  }
  return words.length > 0 ? words.join(" ") : null;
}
