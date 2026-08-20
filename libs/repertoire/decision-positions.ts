/**
 * Decision positions — the trainable unit of a repertoire.
 *
 * A decision position is a position where it is the owner's turn and the
 * tree prepares at least one response. Derived from the built tree on
 * demand, never authored by hand: the chapter's PGN already is the chess
 * knowledge, and a second copy of it would drift.
 *
 * Transpositions collapse: two branches reaching the same position are
 * one decision with the union of both branches' prepared responses —
 * the same identity rule exercises use (one position, one exercise),
 * so a chapter can seed straight into the drill queue without inventing
 * a second notion of "same position".
 */

import { isChildNode } from "@velachess/chess";

import type { BuiltRepertoire } from "./repertoire.ts";
import type { RepertoireTree } from "./tree.ts";

export interface DecisionPosition {
  /** EPD of the position the owner must answer in. */
  positionKey: string;
  /** Every prepared response here, across all transposing branches. */
  expectedSans: string[];
  /** SANs from the chapter start to this position — the first path that
   * reaches it, kept so a trainer can replay the line onto the board. */
  path: string[];
  /** 1-indexed ply of the expected move (path.length + 1). */
  ply: number;
}

/** Side to move, straight from the EPD — field two of the key. */
function sideToMoveOf(positionKey: string): "white" | "black" | null {
  const field = positionKey.split(" ")[1];
  if (field === "w") return "white";
  if (field === "b") return "black";
  return null;
}

/**
 * Walks the tree depth-first, first-branch-first, so the canonical path
 * to a transposed position is stable across runs — same PGN, same
 * positions, same order.
 */
export function decisionPositionsOf(
  repertoire: BuiltRepertoire,
  color: "white" | "black",
): DecisionPosition[] {
  const { tree, index, rootPositionKey } = repertoire;
  const found = new Map<string, DecisionPosition>();

  const consider = (node: RepertoireTree, key: string, path: string[]) => {
    if (found.has(key)) return;
    if (sideToMoveOf(key) !== color) return;

    // The union across transposing branches, same as the deviation
    // finder's candidatesFor: the position exposes every prepared
    // continuation no matter which move order reached it.
    const twins = isChildNode(node) ? (index.get(key) ?? [node]) : [node];
    const responses = [
      ...new Set(twins.flatMap((twin) => twin.children.map((child) => child.data.san))),
    ];
    if (responses.length === 0) return;

    found.set(key, {
      positionKey: key,
      expectedSans: responses,
      path,
      ply: path.length + 1,
    });
  };

  const walk = (node: RepertoireTree, key: string, path: string[]) => {
    consider(node, key, path);
    for (const child of node.children) {
      walk(child, child.data.positionKey, [...path, child.data.san]);
    }
  };

  walk(tree, rootPositionKey, []);
  return [...found.values()];
}
