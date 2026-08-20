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
    .replace(/\{[^}]*\}/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return createHash("sha256").update(movetext).digest("hex");
}
