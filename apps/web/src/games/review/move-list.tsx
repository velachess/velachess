import { cn } from "@velachess/ui/lib/utils";
import { ScrollArea } from "@velachess/ui/components/scroll-area";

import { PieceIcon, pieceKindOf } from "@velachess/ui/chess/piece-icon";
import { moveNumberOf, sideToMoveOf } from "@velachess/chess";

import type { GradedPly, MoveCategory } from "../analysis/index.ts";
import type { ReplayMove } from "./game-record.ts";
import { CATEGORY_TEXT_TONE } from "./move-presentation.ts";
import { gradeAtPly } from "./review-model.ts";
import { useMoveListReview } from "./use-analysis-panel-review.ts";

export interface MoveListProps {
  /** Grades in ply order — shorter than the game while the run streams. */
  graded: readonly GradedPly[];
  whiteName: string;
  blackName: string;
}

interface ScoresheetRow {
  number: number;
  white?: ReplayMove;
  black?: ReplayMove;
}

/**
 * One row per move number, each side in its own column. Built from the
 * positions rather than by pairing plies two at a time: a game can start
 * from a FEN, at any move number and with Black to play, and its first
 * row then has no White move at all.
 */
function scoresheetRows(moves: readonly ReplayMove[]): ScoresheetRow[] {
  const rows: ScoresheetRow[] = [];

  for (const move of moves) {
    const number = moveNumberOf(move.fenBefore);
    const last = rows.at(-1);
    const row = last?.number === number ? last : { number };
    if (row !== last) rows.push(row);
    row[sideToMoveOf(move.fenBefore)] = move;
  }

  return rows;
}

/** Cells are real buttons for keyboard reach. */
export function MoveList({ graded, whiteName, blackName }: MoveListProps) {
  const { moves, currentPly, onSelectPly } = useMoveListReview();

  const rows = scoresheetRows(moves);

  return (
    <ScrollArea className="h-48 lg:h-auto lg:min-h-0 lg:flex-1">
      <div className="grid grid-cols-[2.25rem_1fr_1fr] items-center border-b bg-muted/50 text-[11px] text-muted-foreground">
        <span className="border-r px-1 py-1 text-center">#</span>
        <span className="truncate px-2 py-1">{whiteName}</span>
        <span className="truncate px-2 py-1">{blackName}</span>
      </div>

      <div className="divide-y divide-border/50">
        {rows.map((row) => (
          <div
            key={row.number}
            className="grid grid-cols-[2.25rem_1fr_1fr] items-stretch"
          >
            <span className="flex items-center justify-center border-r px-1 text-xs text-muted-foreground tabular-nums">
              {row.number}.
            </span>
            <MoveCell
              move={row.white}
              graded={graded}
              currentPly={currentPly}
              onSelectPly={onSelectPly}
            />
            <MoveCell
              move={row.black}
              graded={graded}
              currentPly={currentPly}
              onSelectPly={onSelectPly}
            />
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

interface MoveCellProps {
  move: ReplayMove | undefined;
  graded: readonly GradedPly[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
}

function MoveCell({ move, graded, currentPly, onSelectPly }: MoveCellProps) {
  // An unplayed half-move at the end of an odd-length game.
  if (!move) return <span className="px-2 py-1 text-xs text-muted-foreground">…</span>;

  const category = gradeAtPly(graded, move.ply)?.category;

  return (
    <button
      type="button"
      aria-pressed={currentPly === move.ply}
      onClick={() => onSelectPly(move.ply)}
      className={cn(
        "flex w-full items-center gap-1 rounded-xs px-2 py-1.5 text-left text-xs font-medium",
        "hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        currentPly === move.ply && "bg-primary/15",
      )}
    >
      <PieceIcon
        kind={pieceKindOf(move.san)}
        side={sideToMoveOf(move.fenBefore)}
        className="text-sm"
      />
      <span className="truncate">{move.san}</span>
      <MoveGlyph category={category} />
    </button>
  );
}

/** NAG notation, not copy — the glyphs every scoresheet already prints.
 * `best` and `good` earn no symbol: a mark on every move is no mark. */
const CATEGORY_GLYPHS: Partial<Record<MoveCategory, string>> = {
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
};

function MoveGlyph({ category }: { category: MoveCategory | undefined }) {
  const glyph = category && CATEGORY_GLYPHS[category];
  if (!glyph) return null;

  return (
    <span className={cn("shrink-0 font-bold", CATEGORY_TEXT_TONE[category])}>
      {glyph}
    </span>
  );
}
