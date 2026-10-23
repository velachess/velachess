/**
 * Chess.com encodes the name in the ECOUrl slug instead of an [Opening]
 * header, which Lichess and manual PGNs carry. Provider-specific URL
 * parsing, not chess-domain logic: the resolved name is persisted during
 * normalization.
 */

/**
 *   .../openings/Closed-Sicilian-Defense-Grand-Prix-Attack-3...g6-4.Bc4
 * becomes "Closed Sicilian Defense Grand Prix Attack": a move-like token,
 * starting with a digit or an ellipsis, ends the readable part.
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
    if (/^\d/.test(token) || token.startsWith("...")) break;
    if (token.length > 0) words.push(token);
  }
  return words.length > 0 ? words.join(" ") : null;
}
