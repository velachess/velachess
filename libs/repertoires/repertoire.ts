/**
 * Single entry point for turning a parsed PGN into everything
 * `findDeviation` needs. `index` is always derived from `tree` —
 * bundling them stops a caller from passing a tree and an index that
 * don't actually match.
 *
 * Module-level pure policy — see tree.ts's doc comment.
 */

import { Result } from "@badrap/result";
import type { FenError, Game, PgnNodeData, PositionError } from "@velachess/chess";

import { buildPositionIndex, type PositionIndex } from "./position-index.ts";
import {
  buildRepertoireTree,
  type IllegalRepertoireMove,
  type RepertoireTree,
} from "./tree.ts";

export interface BuiltRepertoire {
  tree: RepertoireTree;
  index: PositionIndex;
  rootPositionKey: string;
  illegalMoves: IllegalRepertoireMove[];
}

export function buildRepertoire(
  game: Game<PgnNodeData>,
): Result<BuiltRepertoire, FenError | PositionError> {
  return buildRepertoireTree(game).map(({ tree, rootPositionKey, illegalMoves }) => ({
    tree,
    index: buildPositionIndex(tree),
    rootPositionKey,
    illegalMoves,
  }));
}
