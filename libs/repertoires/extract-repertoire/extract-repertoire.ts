/**
 * Repertoire extraction — derive the book from the games instead of asking
 * the user to declare it. Pure trie work lives in ./extract.ts; this
 * service loads, replays, derives perspective, and persists the result
 * idempotently.
 */

import {
  parsePgn,
  replayMainline,
  resolveGamePerspective,
  sansToPgn,
} from "@velachess/chess";
import type { Database, Repertoire } from "@velachess/infra-db";
import {
  clearJudgments,
  createRepertoire,
  findRepertoireOfColor,
  listGamesForExtraction,
  listRepertoiresByUser,
  renameRepertoire,
  replaceChapters,
} from "@velachess/infra-db";

import {
  extractRepertoireLines,
  type ExtractableGame,
  type ExtractOptions,
} from "./extract.ts";

/** Database and a Drizzle transaction share this type in this codebase
 * (see libs/infra/db/client.ts) — named locally so this slice's own
 * transactional dependencies read in its vocabulary instead of taking
 * `Database` itself. */
type Tx = Database;

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

interface ExtractableGameRow {
  rawPgn: string;
  perspective: string | null;
  whiteName: string;
  blackName: string;
  accountUsername: string | null;
  openingName: string | null;
}

type ListGamesForExtraction = (userId: string) => Promise<ExtractableGameRow[]>;
type FindRepertoireOfColor = (
  userId: string,
  color: ExtractColor,
) => Promise<Pick<Repertoire, "id" | "name" | "source"> | null>;
type InsertRepertoire = (
  tx: Tx,
  data: { userId: string; name: string; color: ExtractColor; source: "extracted" },
) => Promise<Pick<Repertoire, "id">>;
type RenameRepertoire = (tx: Tx, repertoireId: string, name: string) => Promise<void>;
// Promise<unknown>, not Promise<void>: the real db functions return the
// deleted/inserted rows, and "void" only waives the return-type check for
// a bare `void` position, not for a generic like `Promise<void>`.
type ClearJudgments = (tx: Tx, repertoireId: string) => Promise<unknown>;
type ReplaceChapters = (
  tx: Tx,
  repertoireId: string,
  chapters: { name: string; pgn: string }[],
) => Promise<unknown>;
type WithTransaction = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
/** Re-declared identically in add-chapter.ts — duplicating the type is
 * fine, the implementation (drills' seed-lines.ts) is singular. */
type SeedRepertoireLines = (
  userId: string,
  repertoireId: string,
) => Promise<{ seeded: number }>;

export interface ExtractRepertoireDeps {
  listGamesForExtraction: ListGamesForExtraction;
  findRepertoireOfColor: FindRepertoireOfColor;
  insertRepertoire: InsertRepertoire;
  renameRepertoire: RenameRepertoire;
  clearJudgments: ClearJudgments;
  replaceChapters: ReplaceChapters;
  withTransaction: WithTransaction;
  seedRepertoireLines: SeedRepertoireLines;
}

export async function extractRepertoire(
  deps: ExtractRepertoireDeps,
  userId: string,
  color: ExtractColor,
  opts: ExtractOptions = {},
): Promise<ExtractOutcome> {
  const extractable: ExtractableGame[] = [];
  for (const game of await deps.listGamesForExtraction(userId)) {
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
  const existing = await deps.findRepertoireOfColor(userId, color);

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

  const repertoireId = await deps.withTransaction(async (tx) => {
    const target =
      existing ??
      (await deps.insertRepertoire(tx, { userId, name, color, source: "extracted" }));
    // A candidate carrying an older wording of the title is still this
    // color's book — the name is display copy, and re-deriving it is
    // when the product's words catch up with it.
    if (existing && existing.name !== name)
      await deps.renameRepertoire(tx, existing.id, name);
    // The old candidate book is gone, so judgments against it describe
    // chapters that no longer exist — cleared, which re-queues the games
    // for the next judge run against the new book. Only ever a candidate:
    // the confirmed path refused above, before anything was touched.
    await deps.clearJudgments(tx, target.id);
    await deps.replaceChapters(
      tx,
      target.id,
      lines.map((line) => ({ name: line.name, pgn: sansToPgn(line.sans) })),
    );
    return target.id;
  });

  const { seeded } = await deps.seedRepertoireLines(userId, repertoireId);

  return {
    status: "extracted",
    repertoireId,
    chapters: lines.length,
    gamesConsidered: extractable.length,
    seeded,
  };
}

function depsFrom(
  db: Database,
  seedRepertoireLines: SeedRepertoireLines,
): ExtractRepertoireDeps {
  return {
    listGamesForExtraction: (userId) => listGamesForExtraction(db, userId),
    findRepertoireOfColor: (userId, color) => findRepertoireOfColor(db, userId, color),
    insertRepertoire: (tx, data) => createRepertoire(tx, data),
    renameRepertoire: (tx, repertoireId, name) =>
      renameRepertoire(tx, repertoireId, name),
    clearJudgments: (tx, repertoireId) => clearJudgments(tx, repertoireId),
    replaceChapters: (tx, repertoireId, chapters) =>
      replaceChapters(tx, repertoireId, chapters),
    withTransaction: (fn) => db.transaction(fn),
    seedRepertoireLines,
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
 *
 * Kept Database-first for its own reads/writes, matching
 * @velachess/drills' triageAndSeed/seedRepertoireLines: its three callers
 * (accounts/connect-account, accounts/sync-account and games/import-pgn
 * via games/land-new-games) are fully migrated and already wire this
 * through their own declared `EnsureCandidateRepertoires` dependency at
 * the composition root, so nothing forces this into a narrow Deps object
 * of its own. The one truly external dependency — seeding a chapter's
 * decision positions, owned by `@velachess/drills` — is injected here
 * rather than imported directly, which is what keeps this module's only
 * edge into drills at the composition root instead of a real package-level
 * import that would cycle back against drills' own dependency on this
 * module's `buildRepertoire`.
 */
export async function ensureCandidateRepertoires(
  db: Database,
  userId: string,
  opts: { newGames: number },
  seedRepertoireLines: SeedRepertoireLines,
): Promise<{ extracted: ExtractColor[] }> {
  const books = await listRepertoiresByUser(db, userId);
  const extracted: ExtractColor[] = [];
  const deps = depsFrom(db, seedRepertoireLines);

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
    const outcome = await extractRepertoire(deps, userId, color);
    if (outcome.status === "extracted") extracted.push(color);
  }

  return { extracted };
}
