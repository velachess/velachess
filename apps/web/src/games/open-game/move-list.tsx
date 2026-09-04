import { cn } from "@velachess/ui/lib/utils";
import { ScrollArea } from "@velachess/ui/components/scroll-area";

import { PieceIcon, pieceKindOf } from "@velachess/ui/chess/piece-icon";

import { glyphOf, moveNumberOf, sideOfPly } from "../analysis-read.ts";
import type { GradedPly, ReplayMove } from "../analysis-contract.ts";

export interface MoveListProps {
  moves: ReplayMove[];
  /** Grades in ply order — shorter than `moves` while the run streams. */
  graded: GradedPly[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
  whiteName: string;
  blackName: string;
}

/** Cells are real buttons for keyboard reach. */
export function MoveList({
  moves,
  graded,
  currentPly,
  onSelectPly,
  whiteName,
  blackName,
}: MoveListProps) {
  const rows = Array.from({ length: moveNumberOf(moves.length) }, (_, index) => {
    const number = index + 1;
    return {
      number,
      white: moves[number * 2 - 2],
      black: moves[number * 2 - 1],
    };
  });

  return (
    <ScrollArea className="h-72 min-h-0 flex-1 lg:h-auto">
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
  graded: GradedPly[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
}

const GRADE_TONE = {
  blunder: "text-move-blunder",
  mistake: "text-move-mistake",
  inaccuracy: "text-move-inaccuracy",
} as const;

function MoveCell({ move, graded, currentPly, onSelectPly }: MoveCellProps) {
  // An unplayed half-move at the end of an odd-length game.
  if (!move) return <span className="px-2 py-1 text-xs text-muted-foreground">…</span>;

  const category = graded[move.ply - 1]?.category;
  const glyph = glyphOf(category);
  const tone =
    category && category in GRADE_TONE
      ? GRADE_TONE[category as keyof typeof GRADE_TONE]
      : undefined;

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
        side={sideOfPly(move.ply)}
        className="text-sm"
      />
      <span className="truncate">{move.san}</span>
      <MoveGlyph glyph={glyph} tone={tone} />
    </button>
  );
}

function MoveGlyph({ glyph, tone }: { glyph: string | null; tone: string | undefined }) {
  if (!glyph) return null;
  return <span className={cn("shrink-0 font-bold", tone)}>{glyph}</span>;
}
