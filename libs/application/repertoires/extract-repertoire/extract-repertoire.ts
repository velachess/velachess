/**
 * Repertoire extraction — derive the book from the games instead of asking
 * the user to declare it. Pure trie work lives in @velachess/repertoire;
 * this service loads, replays, derives perspective, and persists the
 * result idempotently.
 */

import { parsePgn, replayMainline, sansToPgn } from "@velachess/chess";
import type { Database } from "@velachess/db";
import {
  clearJudgments,
  createRepertoire,
  findRepertoireOfColor,
  listGamesForExtraction,
  listRepertoiresByUser,
  renameRepertoire,
  replaceChapters,
} from "@velachess/db";
import type { ExtractOptions } from "@velachess/repertoire";
import { extractRepertoireLines, type ExtractableGame } from "@velachess/repertoire";

import { resolveGamePerspective } from "../../perspective.ts";
import { seedRepertoireLines } from "../../drills/seed-exercises/seed-lines.ts";

export type ExtractColor = "white" | "black";

/**
 * What each side's book is called.
 *
 * Not "Extracted — white": the derivation is how the book got here, not
 * what it is, and a name that leads with its plumbing tells the reader
 * to distrust it. The product has exactly two books and this is what
 * they are called, whoever wrote them.
 */
export const REPERTOIRE_NAME: Record<ExtractColor, string> = {
  white: "White repertoire",
  black: "Black repertoire",
};

export type ExtractOutcome =
  /** No supported line and no existing candidate to refresh — nothing is
   * written; a book with zero chapters would read as configured when it
   * is not. */
  | { status: "nothing-to-extract" }
  | {
      status: "extracted";
      repertoireId: string;
      /** Chapters written (0 = no line reached minGames support). */
      chapters: number;
      /** Games of the color with a valid mainline that fed the trie. */
      gamesConsidered: number;
      /** Decision positions seeded into the training queue. */
      seeded: number;
    }
  /** The extraction target was confirmed (manually edited) preparation.
   * Games are evidence, not intent — a confirmed book never mutates from
   * new games. Delete it or rename it to extract fresh. */
  | { status: "refused-confirmed"; repertoireId: string };

export async function extractRepertoire(
  db: Database,
  userId: string,
  color: ExtractColor,
  opts: ExtractOptions = {},
): Promise<ExtractOutcome> {
  const extractable: ExtractableGame[] = [];
  for (const game of await listGamesForExtraction(db, userId)) {
    if (resolveGamePerspective(game) !== color) continue;

    const parsed = parsePgn(game.rawPgn)[0];
    if (!parsed) continue;
    const replayed = replayMainline(parsed);
    if (replayed.isErr) continue;

    extractable.push({
      sans: replayed.unwrap().moves.map((move) => move.san),
      openingName: game.openingName,
    });
  }

  const lines = extractRepertoireLines(extractable, opts);

  const name = REPERTOIRE_NAME[color];
  const existing = await findRepertoireOfColor(db, userId, color);

  // Never silently overwrite confirmed preparation: an extracted target
  // that was manually edited stopped being a candidate. The refusal is
  // an outcome, not an error — the caller says it to the user.
  if (existing && existing.source === "manual") {
    return { status: "refused-confirmed", repertoireId: existing.id };
  }

  // Nothing reached the support floor and no candidate exists: write
  // nothing. An empty existing candidate is also left alone — a sync
  // that lost games is no reason to erase what the last one derived.
  if (lines.length === 0) {
    return { status: "nothing-to-extract" };
  }

  const repertoireId = await db.transaction(async (tx) => {
    const target =
      existing ??
      (await createRepertoire(tx, { userId, name, color, source: "extracted" }));
    // A candidate carrying an older wording of the title is still this
    // color's book — the name is display copy, and re-deriving it is
    // when the product's words catch up with it.
    if (existing && existing.name !== name) await renameRepertoire(tx, existing.id, name);
    // The old candidate book is gone, so judgments against it describe
    // chapters that no longer exist — cleared, which re-queues the games
    // for the next judge run against the new book. Only ever a candidate:
    // the confirmed path refused above, before anything was touched.
    await clearJudgments(tx, target.id);
    await replaceChapters(
      tx,
      target.id,
      lines.map((line) => ({ name: line.name, pgn: sansToPgn(line.sans) })),
    );
    return target.id;
  });

  const { seeded } = await seedRepertoireLines(db, userId, repertoireId);

  return {
    status: "extracted",
    repertoireId,
    chapters: lines.length,
    gamesConsidered: extractable.length,
    seeded,
  };
}

/**
 * The automatic path: repertoires are grown from games, not created by
 * buttons. Runs inside the sync pipeline, per color, with three guards —
 * a color whose books include real (manual/confirmed) preparation is
 * never touched; a missing candidate is extracted whenever games exist;
 * an existing candidate refreshes only when this sync actually brought
 * new games, because refreshing clears and re-judges its judgments and
 * a no-op sync should not cost hundreds of replays.
 */
export async function ensureCandidateRepertoires(
  db: Database,
  userId: string,
  opts: { newGames: number },
): Promise<{ extracted: ("white" | "black")[] }> {
  const books = await listRepertoiresByUser(db, userId);
  const extracted: ("white" | "black")[] = [];

  for (const color of ["white", "black"] as const) {
    const ofColor = books.filter((book) => book.color === color);
    // `source`, not the name: a renamed candidate is still derived, and
    // what makes preparation the user's own is having edited it.
    const hasRealPreparation = ofColor.some((book) => book.source === "manual");
    if (hasRealPreparation) continue;

    const hasCandidate = ofColor.length > 0;
    if (hasCandidate && opts.newGames === 0) continue;

    // Sequential on purpose: two colors, and each run judges afterwards.
    // oxlint-disable-next-line eslint/no-await-in-loop
    const outcome = await extractRepertoire(db, userId, color);
    if (outcome.status === "extracted") extracted.push(color);
  }

  return { extracted };
}
