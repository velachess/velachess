/**
 * One chapter, with everything an interactive board or a trainer needs:
 * the variation tree as plain nodes, the decision positions the owner
 * must be able to answer, and the branches the PGN lost to typos.
 *
 * This is the heavy endpoint on purpose — the repertoire detail lists
 * chapters by name and order, and the tree only ships when a chapter is
 * actually opened.
 */

import { parsePgn } from "@velachess/chess";
import type { RepertoireChapter } from "@velachess/infra-db";

import { buildRepertoire } from "../repertoire.ts";
import type { IllegalRepertoireMove } from "../tree.ts";
import { chapterView } from "./chapter-view.ts";
import type { ChapterLineView, ChapterStartView } from "./chapter-view.ts";

export interface ChapterDetail {
  id: string;
  repertoireId: string;
  repertoireName: string;
  /** The side whose decisions this chapter trains. */
  color: "white" | "black";
  name: string;
  sortOrder: number;
  pgn: string;
  /** Where the board opens: position, whose turn, what the book plays. */
  start: ChapterStartView;
  /**
   * The chapter as lines a board can read: mainline first, each
   * variation its own line carrying the cursor it replaces and the trail
   * into it. Every move arrives labeled ("2... Nf6"), board-ready (fen),
   * with its squares and the continuations prepared from it.
   *
   * Formatted here rather than in the screen on purpose: numbering, PGN
   * reading order and "which square did this SAN touch" are chess, and a
   * client re-deriving them is a second implementation nobody tests.
   */
  lines: ChapterLineView[];
  /** Authored lines the PGN lost to illegal moves — surfaced, not eaten. */
  illegalMoves: IllegalRepertoireMove[];
}

export type ChapterOutcome =
  | { status: "found"; chapter: ChapterDetail }
  | { status: "not-found" }
  /** The stored PGN no longer parses or builds — the row exists but the
   * board cannot be served. Said explicitly instead of a bare 500. */
  | { status: "unreadable" };

type GetChapterForUser = (
  userId: string,
  repertoireId: string,
  chapterId: string,
) => Promise<{
  chapter: RepertoireChapter;
  repertoireName: string;
  color: "white" | "black";
} | null>;

export interface GetChapterDeps {
  getChapterForUser: GetChapterForUser;
}

export async function getChapterDetail(
  deps: GetChapterDeps,
  userId: string,
  repertoireId: string,
  chapterId: string,
): Promise<ChapterOutcome> {
  const row = await deps.getChapterForUser(userId, repertoireId, chapterId);
  if (!row) return { status: "not-found" };

  const parsed = parsePgn(row.chapter.pgn)[0];
  if (!parsed) return { status: "unreadable" };
  const built = buildRepertoire(parsed);
  if (built.isErr) return { status: "unreadable" };
  const repertoire = built.unwrap();
  const view = chapterView(repertoire, row.color);

  return {
    status: "found",
    chapter: {
      id: row.chapter.id,
      repertoireId: row.chapter.repertoireId,
      repertoireName: row.repertoireName,
      color: row.color,
      name: row.chapter.name,
      sortOrder: row.chapter.sortOrder,
      pgn: row.chapter.pgn,
      start: view.start,
      lines: view.lines,
      illegalMoves: repertoire.illegalMoves,
    },
  };
}
