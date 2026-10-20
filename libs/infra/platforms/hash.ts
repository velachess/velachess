/**
 * Dedup key for a PGN's movetext, independent of header/comment formatting —
 * the same game fetched twice with different [Site]/[Date] noise or
 * differently-spaced [%clk] annotations still hashes the same as long as
 * the moves match.
 */

import { createHash } from "node:crypto";

export function movetextHash(rawPgn: string): string {
  const movetext = rawPgn
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("["))
    .join(" ")
    // PGN comments cannot nest, so excluding `{` from the body keeps an
    // unterminated brace run from re-scanning the rest of the string
    // (quadratic ReDoS on provider-supplied PGN).
    .replace(/\{[^{}]*\}/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return createHash("sha256").update(movetext).digest("hex");
}
