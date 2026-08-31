/**
 * Deviation Finder — walks a played game (already run through
 * `replayMainline`) in lockstep against a repertoire tree, no engine
 * involved. Stops at the first ply that doesn't match a prepared branch.
 *
 * Private to judge-games: moved here from the old `@velachess/repertoire`
 * package (this slice was its only consumer, confirmed by repo-wide
 * grep). `libs/infra/db/queries/deviations.ts` needs this exact shape
 * too but declares its own structurally-identical `DeviationResult` type
 * rather than importing it from here — infra must never depend on a
 * business module, and this package's non-wildcard tsconfig path only
 * exposes index.ts anyway. Duplicate the type, never the implementation.
 */

import type { ChildNode, Move, ReplayedGame } from "@velachess/chess";
import { isChildNode, isNormal, positionKeyOf } from "@velachess/chess";

// Unlike libs/drills/seed-exercises (which reaches these same tree/index
// types through a deep import into the OLD @velachess/repertoire package
// to avoid a real cycle — repertoires already depends on drills via
// seedRepertoireLines), games has no edge from repertoires back into it,
// so these module-level pure-policy types are exposed from
// @velachess/repertoires's index.ts instead, same as BuiltRepertoire below.
import type {
  BuiltRepertoire,
  PositionIndex,
  RepertoireNodeData,
  RepertoireTree,
} from "@velachess/repertoires";

function movesEqual(a: Move, b: Move): boolean {
  if (isNormal(a) && isNormal(b))
    return a.from === b.from && a.to === b.to && a.promotion === b.promotion;
  if (!isNormal(a) && !isNormal(b)) return a.role === b.role && a.to === b.to;
  return false;
}

/**
 * The prepared continuations from `node`'s position — not just `node`'s own
 * children, but the union across every tree node that shares its position
 * key. The same position exposes the same prepared continuations no matter
 * which historical move order reached it.
 */
function candidatesFor(
  node: RepertoireTree,
  index: PositionIndex,
): ChildNode<RepertoireNodeData>[] {
  if (!isChildNode(node)) return node.children;
  const twins = index.get(node.data.positionKey) ?? [node];
  return twins.flatMap((twin) => twin.children);
}

function expectedMovesForOwnDeviation(
  isOwnPly: boolean,
  candidates: ChildNode<RepertoireNodeData>[],
) {
  if (!isOwnPly || candidates.length === 0) return undefined;

  return [
    ...new Map(
      candidates.map((c) => [c.data.san, { move: c.data.move, san: c.data.san }]),
    ).values(),
  ];
}

function deviationEventType(
  isOwnPly: boolean,
  candidates: ChildNode<RepertoireNodeData>[],
): DeviationEvent["type"] {
  if (candidates.length === 0) return "book-ended";
  if (isOwnPly) return "deviation";
  return "gap";
}

interface DeviationEvent {
  /**
   * "deviation" — your own move didn't match a prepared line. "gap" — the
   * opponent's reply wasn't prepared for. "book-ended" — nothing is
   * prepared here at all, anywhere in the tree; the line simply ran out.
   */
  type: "deviation" | "gap" | "book-ended";
  /** 1-indexed. */
  ply: number;
  positionKey: string;
  actualMove: Move;
  actualSan: string;
  /** Every prepared choice at this node, in case there's more than one. Only
   * set for "deviation" — absent for a gap. `undefined` is a real value
   * here, not a missing key. */
  expectedMoves?: { move: Move; san: string }[] | undefined;
}

export interface DeviationResult {
  inBookPlies: number;
  /** null = the whole game stayed inside the repertoire tree. */
  event: DeviationEvent | null;
}

export function findDeviation(
  repertoire: BuiltRepertoire,
  replay: ReplayedGame,
  color: "white" | "black",
): DeviationResult {
  const { tree, index } = repertoire;
  let node: RepertoireTree = tree;

  for (let i = 0; i < replay.moves.length; i++) {
    const played = replay.moves[i];
    if (!played) break;

    const isOwnPly = (played.fenBefore.includes(" w ") ? "white" : "black") === color;
    const candidates = candidatesFor(node, index);
    const match = candidates.find((child) => movesEqual(child.data.move, played.move));

    if (!match) {
      const expectedMoves = expectedMovesForOwnDeviation(isOwnPly, candidates);

      return {
        inBookPlies: i,
        event: {
          type: deviationEventType(isOwnPly, candidates),
          ply: i + 1,
          positionKey: positionKeyOf(played.fenBefore),
          actualMove: played.move,
          actualSan: played.san,
          expectedMoves,
        },
      };
    }

    node = match;
  }

  return { inBookPlies: replay.moves.length, event: null };
}
