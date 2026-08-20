/**
 * Repertoire tree — a PGN with variations already parses into a real tree
 * via chessops (`Node`/`ChildNode`); this just walks it with `transform`,
 * validating each branch the same way `replayMainline` validates the
 * mainline, and stamping each node with a transposition-safe position key.
 */

import { Result } from "@badrap/result";
import {
  type FenError,
  type Game,
  makeFen,
  type Move,
  type Node,
  parseSan,
  type PgnNodeData,
  type Position,
  type PositionError,
  startingPosition,
  transform,
} from "@velachess/chess";

export interface RepertoireNodeData {
  move: Move;
  san: string;
  /** makeFen(setup, { epd: true }) — same position reached via a different move order collapses to the same key. */
  positionKey: string;
  // A PGN node carries these as `undefined` when the tag is absent.
  comments?: string[] | undefined;
  nags?: number[] | undefined;
  startingComments?: string[] | undefined;
}

export type RepertoireTree = Node<RepertoireNodeData>;

export interface IllegalRepertoireMove {
  /** SANs from the root leading up to (not including) the illegal move. */
  path: string[];
  san: string;
  positionKeyBefore: string;
}

export interface RepertoireBuildResult {
  tree: RepertoireTree;
  /** EPD of the tree's starting position — lets a caller check whether a
   * game even belongs to this chapter's universe before judging it. */
  rootPositionKey: string;
  /** Branches cut because their SAN wasn't legal there — surfaced instead of silently dropped, since this is authored data, not an imported game. */
  illegalMoves: IllegalRepertoireMove[];
}

interface BuildContext {
  pos: Position;
  path: string[];
  clone(): BuildContext;
}

function buildContext(pos: Position, path: string[]): BuildContext {
  return {
    pos,
    path,
    clone: () => buildContext(pos.clone(), [...path]),
  };
}

/**
 * Builds a repertoire tree from a parsed PGN (with variations). Illegal
 * branches are cut, same as `replayMainline`, but reported in `illegalMoves`
 * rather than silently dropped — an authored repertoire that loses a line
 * to a typo should say so.
 */
export function buildRepertoireTree(
  game: Game<PgnNodeData>,
): Result<RepertoireBuildResult, FenError | PositionError> {
  return startingPosition(game.headers).map((startPos) => {
    const illegalMoves: IllegalRepertoireMove[] = [];
    const rootPositionKey = makeFen(startPos.toSetup(), { epd: true });

    const tree = transform(game.moves, buildContext(startPos, []), (ctx, node) => {
      const move = parseSan(ctx.pos, node.san);
      if (!move) {
        illegalMoves.push({
          path: [...ctx.path],
          san: node.san,
          positionKeyBefore: makeFen(ctx.pos.toSetup(), { epd: true }),
        });
        return undefined;
      }

      ctx.pos.play(move);
      ctx.path.push(node.san);

      return {
        move,
        san: node.san,
        positionKey: makeFen(ctx.pos.toSetup(), { epd: true }),
        comments: node.comments,
        nags: node.nags,
        startingComments: node.startingComments,
      };
    });

    return { tree, rootPositionKey, illegalMoves };
  });
}
