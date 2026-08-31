/**
 * A chapter, formatted for a board.
 *
 * The screen that reads a chapter should map over data, not compute
 * chess: move numbering, PGN reading order, which square a SAN touches,
 * whose turn it is and what the book answers there are all decided here,
 * where they are pure and testable, and shipped ready to render.
 *
 * The shape is a flat list of lines. The first is the mainline; each
 * variation is its own line, carrying the cursor it branches from and
 * the labeled moves leading into it. A client renders it with two maps
 * and no recursion.
 *
 * Moved from the old `@velachess/repertoire` package — this slice is its
 * only consumer.
 */

import type { ChildNode } from "@velachess/chess";
import { isChildNode, makeUci } from "@velachess/chess";
import { epdToFen } from "@velachess/chess";

import type { PositionIndex } from "../position-index.ts";
import type { BuiltRepertoire } from "../repertoire.ts";
import type { RepertoireNodeData, RepertoireTree } from "../tree.ts";

/** Where a move sits: which line, and its index inside that line. */
interface MoveCursor {
  line: number;
  move: number;
}

interface PreparedMove {
  san: string;
  from: string;
  to: string;
  /** Where playing it lands — so a click on the answer navigates. */
  at: MoveCursor;
}

interface ChapterMoveView {
  san: string;
  /** "1. e4", "e5", "2... Nf6" — numbering already resolved. */
  label: string;
  positionKey: string;
  /** Board-ready, no conversion needed. */
  fen: string;
  /** The squares this move touched, for the last-move highlight. */
  from: string;
  to: string;
  /** 1-indexed ply from the chapter's start. */
  ply: number;
  /** True when the side to move here is the one this book trains. */
  isOwnTurn: boolean;
  /** What the book plays from this position. Empty where the line ends. */
  prepared: PreparedMove[];
}

export interface ChapterLineView {
  /** 0 for the mainline, 1 for a variation of it, and so on. */
  depth: number;
  /** The move this line replaces. Null for the mainline. */
  branchesFrom: MoveCursor | null;
  /** The moves leading into this line, labeled — a client renders the
   * "you are here" trail as a map over this plus the moves so far. */
  prefix: { label: string; at: MoveCursor }[];
  moves: ChapterMoveView[];
}

export interface ChapterStartView {
  positionKey: string;
  fen: string;
  isOwnTurn: boolean;
  prepared: PreparedMove[];
}

export interface ChapterView {
  start: ChapterStartView;
  lines: ChapterLineView[];
}

/** "1. e4" / "e5" / "2... Nf6" — a black move is numbered only when it
 * opens a line, which is exactly PGN's own convention. */
function labelOf(ply: number, san: string, atLineStart: boolean): string {
  const moveNumber = Math.ceil(ply / 2);
  if (ply % 2 === 1) return `${moveNumber}. ${san}`;
  return atLineStart ? `${moveNumber}... ${san}` : san;
}

function squaresOf(data: RepertoireNodeData): { from: string; to: string } {
  const uci = makeUci(data.move);
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

function sideToMoveOf(positionKey: string): "white" | "black" {
  return positionKey.split(" ")[1] === "b" ? "black" : "white";
}

/**
 * The prepared continuations from a node's position — the union across
 * every node that transposes into it, same rule the deviation finder
 * applies, so the reader shows what a game would actually be judged
 * against.
 */
function continuationsOf(
  node: RepertoireTree,
  index: PositionIndex,
  positionKey: string,
) {
  const twins = isChildNode(node) ? (index.get(positionKey) ?? [node]) : [node];
  const seen = new Set<string>();
  return twins
    .flatMap((twin) => twin.children)
    .filter((child) => {
      if (seen.has(child.data.san)) return false;
      seen.add(child.data.san);
      return true;
    });
}

/**
 * Walks the tree into flat lines. The first child continues the current
 * line; every other child opens a variation queued for its own line, in
 * the order a reader meets them.
 */
export function chapterView(
  repertoire: BuiltRepertoire,
  color: "white" | "black",
): ChapterView {
  const { tree, index, rootPositionKey } = repertoire;

  const lines: ChapterLineView[] = [];
  /** The node behind each rendered move, by line — so the second pass
   * can ask a move for its continuations without searching the tree. */
  const nodesByLine: RepertoireTree[][] = [];
  const cursorOfNode = new Map<RepertoireTree, MoveCursor>();

  interface Pending {
    /** Always a ChildNode — the root is never queued as a line head. */
    node: ChildNode<RepertoireNodeData>;
    startPly: number;
    depth: number;
    branchesFrom: MoveCursor | null;
    prefix: { label: string; at: MoveCursor }[];
  }

  const queue: Pending[] = tree.children.map((child, branchIndex) => ({
    node: child,
    startPly: 1,
    depth: branchIndex === 0 ? 0 : 1,
    branchesFrom: null,
    prefix: [],
  }));

  while (queue.length > 0) {
    const pending = queue.shift()!;
    const lineIndex = lines.length;
    const moves: ChapterMoveView[] = [];
    const nodes: RepertoireTree[] = [];
    // Placed before the walk so children can reference this line's index.
    lines.push({
      depth: pending.depth,
      branchesFrom: pending.branchesFrom,
      prefix: pending.prefix,
      moves,
    });
    nodesByLine.push(nodes);

    let node: ChildNode<RepertoireNodeData> = pending.node;
    let ply = pending.startPly;
    for (;;) {
      const cursor: MoveCursor = { line: lineIndex, move: moves.length };
      cursorOfNode.set(node, cursor);
      nodes.push(node);
      const data = node.data;
      const { from, to } = squaresOf(data);
      moves.push({
        san: data.san,
        label: labelOf(ply, data.san, moves.length === 0),
        positionKey: data.positionKey,
        fen: epdToFen(data.positionKey),
        from,
        to,
        ply,
        isOwnTurn: sideToMoveOf(data.positionKey) === color,
        prepared: [],
      });

      const continuations = continuationsOf(node, index, data.positionKey);
      const [next, ...alternatives] = continuations;
      if (!next) break;

      // The cursor the next move will occupy — what a variation from
      // here replaces, which is the move itself and not the one before.
      const replaces: MoveCursor = { line: lineIndex, move: moves.length };

      // Variations open their own line, and the trail into them is the
      // current line's prefix plus everything walked so far.
      const prefix = [
        ...pending.prefix,
        ...moves.map((move, moveIndex) => ({
          label: move.label,
          at: { line: lineIndex, move: moveIndex },
        })),
      ];
      for (const alternative of alternatives) {
        // Already rendered means this alternative transposes into a line
        // the reader has: the prepared move points there instead of the
        // same moves appearing twice under different cursors.
        if (cursorOfNode.has(alternative)) continue;
        queue.push({
          node: alternative,
          startPly: ply + 1,
          depth: pending.depth + 1,
          branchesFrom: replaces,
          prefix,
        });
      }

      // A line that walks into an already-rendered node has transposed:
      // it ends here, and its last move's `prepared` carries the cursor
      // into the line that continues it.
      if (cursorOfNode.has(next)) break;

      node = next;
      ply++;
    }
  }

  // Second pass: every prepared move now has a cursor to point at.
  const preparedFrom = (node: RepertoireTree, positionKey: string): PreparedMove[] =>
    continuationsOf(node, index, positionKey).flatMap((child) => {
      const at = cursorOfNode.get(child);
      if (!at) return [];
      const { from, to } = squaresOf(child.data);
      return [{ san: child.data.san, from, to, at }];
    });

  for (const [lineIndex, line] of lines.entries()) {
    for (const [moveIndex, move] of line.moves.entries()) {
      const node = nodesByLine[lineIndex]?.[moveIndex];
      if (node) move.prepared = preparedFrom(node, move.positionKey);
    }
  }

  return {
    start: {
      positionKey: rootPositionKey,
      fen: epdToFen(rootPositionKey),
      isOwnTurn: sideToMoveOf(rootPositionKey) === color,
      prepared: preparedFrom(tree, rootPositionKey),
    },
    lines,
  };
}
