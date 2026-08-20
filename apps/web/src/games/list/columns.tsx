import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Link } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";

import { Badge } from "@velachess/ui/components/badge";
import type { DataTableFeatures } from "@velachess/ui/components/data-table";
import { ChessComIcon, LichessIcon, FileText } from "@velachess/ui/icons";
import { cn } from "@velachess/ui/lib/utils";

import type { Game } from "./queries.ts";

const GAMES_COLUMNS_COPY = {
  opponent: msg`Opponent`,
  result: msg`Result`,
  time: msg`Time`,
  date: msg`Date`,
  win: msg`Win`,
  loss: msg`Loss`,
  draw: msg`Draw`,
  unfinished: msg`Unfinished`,
  bullet: msg`Bullet`,
  blitz: msg`Blitz`,
  rapid: msg`Rapid`,
  classical: msg`Classical`,
  correspondence: msg`Correspondence`,
  playedWhite: msg`You played white`,
  playedBlack: msg`You played black`,
} as const;

/** Platform names are proper nouns — not translated. */
const PLATFORMS = {
  chess_com: { icon: ChessComIcon, label: "Chess.com" },
  lichess: { icon: LichessIcon, label: "Lichess" },
  pgn: { icon: FileText, label: "PGN" },
} as const;

/**
 * Who you played, from your seat. Without `perspective` the game was
 * never attributed, and white is simply the top name.
 */
export function opponentOf(game: Game) {
  const asBlack = game.perspective === "black";
  return {
    name: asBlack ? game.whiteName : game.blackName,
    rating: asBlack ? game.whiteRating : game.blackRating,
  };
}

export type Outcome = "win" | "loss" | "draw" | "unfinished";

/** The scoresheet says "1-0"; whether that's a win depends on your side. */
export function outcomeOf(game: Game): Outcome {
  if (game.result === "1/2-1/2") return "draw";
  if (game.result === "*" || game.perspective === null) return "unfinished";

  const won =
    game.perspective === "white" ? game.result === "1-0" : game.result === "0-1";
  return won ? "win" : "loss";
}

const OUTCOME_LABELS: Record<Outcome, MessageDescriptor> = {
  win: GAMES_COLUMNS_COPY.win,
  loss: GAMES_COLUMNS_COPY.loss,
  draw: GAMES_COLUMNS_COPY.draw,
  unfinished: GAMES_COLUMNS_COPY.unfinished,
};

const OUTCOME_BADGE = {
  win: {
    variant: "outline",
    className:
      "border-transparent bg-move-ok/10 text-move-ok dark:bg-move-ok/20 [a]:hover:bg-move-ok/20",
  },
  loss: { variant: "destructive", className: undefined },
  draw: { variant: "secondary", className: undefined },
  unfinished: { variant: "outline", className: undefined },
} as const;

/**
 * "10 min", "3 + 2" — from the clock, not the platform's label, which
 * Lichess and chess.com word differently for the same game.
 */
export function formatClock(
  initialSeconds: number | null,
  incrementSeconds: number | null,
) {
  if (initialSeconds === null) return null;

  const minutes = initialSeconds / 60;
  const base = Number.isInteger(minutes) ? `${minutes} min` : `${initialSeconds}s`;
  return incrementSeconds ? `${base} + ${incrementSeconds}` : base;
}

const columnHelper = createColumnHelper<DataTableFeatures, Game>();

export interface ColumnDeps {
  translate: (message: MessageDescriptor) => string;
  /** Locale-aware, built once by the screen — never hand-formatted. */
  formatDate: (iso: string) => string;
  timeClassLabel: (game: Game) => string | null;
}

export function gamesColumns({ translate, formatDate, timeClassLabel }: ColumnDeps) {
  return columnHelper.columns([
    columnHelper.display({
      id: "source",
      cell: ({ row }) => {
        const game = row.original;
        const platform = PLATFORMS[game.source];
        const Icon = platform.icon;
        const playedWhite = game.perspective !== "black";

        return (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Icon className="size-4" aria-label={platform.label} />
            <span
              aria-label={translate(
                playedWhite
                  ? GAMES_COLUMNS_COPY.playedWhite
                  : GAMES_COLUMNS_COPY.playedBlack,
              )}
              className={
                playedWhite
                  ? "size-2.5 rounded-xs bg-foreground"
                  : "size-2.5 rounded-xs border border-border bg-background"
              }
            />
          </span>
        );
      },
    }),
    columnHelper.accessor("blackName", {
      id: "opponent",
      header: () => translate(GAMES_COLUMNS_COPY.opponent),
      cell: ({ row }) => {
        const { name, rating } = opponentOf(row.original);
        const openingName = row.original.openingName;
        return (
          // A link, not an onClick: opening a game is navigation, and a
          // keyboard-reachable row is what the tests assert.
          <Link
            to="/games/$gameId"
            params={{ gameId: row.original.id }}
            className="flex flex-col rounded-sm no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="font-medium">
              {name} <OpponentRating rating={rating} />
            </span>
            <OpeningName openingName={openingName} />
          </Link>
        );
      },
    }),
    columnHelper.accessor("result", {
      header: () => translate(GAMES_COLUMNS_COPY.result),
      cell: ({ row }) => {
        const outcome = outcomeOf(row.original);
        const badge = OUTCOME_BADGE[outcome];
        return (
          <Badge variant={badge.variant} className={cn(badge.className)}>
            {translate(OUTCOME_LABELS[outcome])}
          </Badge>
        );
      },
    }),
    columnHelper.accessor("timeControlInitialSeconds", {
      id: "clock",
      header: () => translate(GAMES_COLUMNS_COPY.time),
      cell: ({ row }) => {
        const game = row.original;
        const clock = formatClock(
          game.timeControlInitialSeconds,
          game.timeControlIncrementSeconds,
        );
        if (!clock) return <span className="text-muted-foreground">—</span>;

        return (
          <div className="flex flex-col">
            <span>{clock}</span>
            <span className="text-xs text-muted-foreground">{timeClassLabel(game)}</span>
          </div>
        );
      },
    }),
    columnHelper.accessor("playedAt", {
      header: () => translate(GAMES_COLUMNS_COPY.date),
      cell: ({ row }) => {
        const playedAt = row.original.playedAt ? formatDate(row.original.playedAt) : "—";

        return <span className="text-muted-foreground">{playedAt}</span>;
      },
    }),
  ]);
}

function OpponentRating({ rating }: { rating: number | null }) {
  if (rating === null) return null;
  return <span className="text-muted-foreground">{rating}</span>;
}

function OpeningName({ openingName }: { openingName: string | null }) {
  if (!openingName) return null;
  return <span className="text-xs text-muted-foreground">{openingName}</span>;
}
