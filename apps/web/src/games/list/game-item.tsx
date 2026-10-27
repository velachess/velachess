import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Link } from "@tanstack/react-router";

import { gameOutcomeFor, opposite, timeClassOf, type TimeClass } from "@velachess/chess";
import { PlayerStrip } from "@velachess/ui/chess/player-strip";
import { Badge } from "@velachess/ui/components/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@velachess/ui/components/item";
import {
  BookOpen,
  ChevronRight,
  Clock3,
  Hourglass,
  Timer,
  Zap,
} from "@velachess/ui/icons";

import { GAME_SOURCES } from "../game-sources.ts";
import { flairImageOf } from "../import/index.ts";
import { SourceMark } from "../source-mark.tsx";
import type { Game } from "./queries.ts";

const GAME_ITEM_COPY = {
  matchup: msg`{white} vs {black}`,
  win: msg`Win`,
  loss: msg`Loss`,
  draw: msg`Draw`,
  unfinished: msg`Unfinished`,
  bullet: msg`Bullet`,
  blitz: msg`Blitz`,
  rapid: msg`Rapid`,
  classical: msg`Classical`,
  playedWhite: msg`You played white`,
  playedBlack: msg`You played black`,
} as const;

/** Chess has no conventional glyph for a time control, so the choice is
 * made once here rather than at each use. */
const TIME_CLASSES: Record<TimeClass, { label: MessageDescriptor; Mark: typeof Zap }> = {
  bullet: { label: GAME_ITEM_COPY.bullet, Mark: Zap },
  blitz: { label: GAME_ITEM_COPY.blitz, Mark: Timer },
  rapid: { label: GAME_ITEM_COPY.rapid, Mark: Clock3 },
  classical: { label: GAME_ITEM_COPY.classical, Mark: Hourglass },
};

/**
 * From the clock, not the platform's label, which Lichess and chess.com
 * word differently for the same game.
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

const OUTCOME_BADGE = {
  win: { label: GAME_ITEM_COPY.win, variant: "success" },
  loss: { label: GAME_ITEM_COPY.loss, variant: "destructive" },
  draw: { label: GAME_ITEM_COPY.draw, variant: "secondary" },
  unfinished: { label: GAME_ITEM_COPY.unfinished, variant: "secondary" },
} as const;

function PlayedColor({ perspective }: { perspective: Game["perspective"] }) {
  const { i18n } = useLingui();
  if (perspective === null) return null;

  // The side someone played is white or black, not light or dark theme:
  // reading it off `foreground` inverted it between the two.
  const playedWhite = perspective === "white";
  return (
    <>
      <span
        aria-hidden
        className={
          playedWhite
            ? "size-2.5 shrink-0 rounded-xs border border-border bg-white"
            : "size-2.5 shrink-0 rounded-xs border border-border bg-black"
        }
      />
      <span className="sr-only">
        {i18n._(playedWhite ? GAME_ITEM_COPY.playedWhite : GAME_ITEM_COPY.playedBlack)}
      </span>
    </>
  );
}

function TimeControl({ game }: { game: Game }) {
  const { i18n } = useLingui();
  const timeClass = timeClassOf(
    game.timeControlInitialSeconds,
    game.timeControlIncrementSeconds,
  );
  if (!timeClass) return null;

  const { label, Mark } = TIME_CLASSES[timeClass];
  const clock = formatClock(
    game.timeControlInitialSeconds,
    game.timeControlIncrementSeconds,
  );
  return (
    <span className="flex items-center gap-1.5">
      <Mark className="size-3.5" />
      <span>{i18n._(label)}</span>
      {clock && <span className="text-muted-foreground/80">{clock}</span>}
    </span>
  );
}

function OutcomeBadge({ game }: { game: Game }) {
  const { i18n } = useLingui();
  const outcome = gameOutcomeFor(game.result, game.perspective);
  const { label, variant } = OUTCOME_BADGE[outcome];
  const unattributed = outcome === "unfinished" && game.result !== "*";

  return (
    <Badge variant={variant} className="tabular-nums">
      {unattributed ? game.result : i18n._(label)}
    </Badge>
  );
}

function Opponent({ game, side }: { game: Game; side: "white" | "black" }) {
  const { i18n } = useLingui();
  const white = side === "white";
  const rating = white ? game.whiteRating : game.blackRating;
  const { avatarUrl, flair, countryCode } = white
    ? game.whiteIdentity
    : game.blackIdentity;

  return (
    <PlayerStrip
      name={white ? game.whiteName : game.blackName}
      rating={rating === null ? undefined : i18n.number(rating)}
      avatarSrc={avatarUrl ?? undefined}
      flairSrc={flair ? flairImageOf(flair) : undefined}
      countryCode={countryCode ?? undefined}
    />
  );
}

export function GameItem({ game }: { game: Game }) {
  const { i18n } = useLingui();
  // Null when the game was never attributed: calling one of the players
  // the opponent would invent a seat nobody knows.
  const opponentSide = game.perspective === null ? null : opposite(game.perspective);
  const playedAt = game.playedAt
    ? i18n.date(new Date(game.playedAt), { day: "numeric", month: "short" })
    : null;

  return (
    // A link, not an onClick: opening a game is navigation, and a keyboard
    // can reach a link.
    <Item
      render={<Link to="/games/$gameId" params={{ gameId: game.id }} />}
      className="gap-3 rounded-md px-2 py-3 no-underline sm:px-3"
    >
      <ItemMedia>
        {/* Until static FEN thumbnails exist. */}
        <div
          aria-hidden
          className="size-14 shrink-0 rounded-md border bg-muted sm:size-20"
        />
      </ItemMedia>

      <ItemContent className="min-w-0 gap-1.5">
        <ItemTitle className="w-full min-w-0">
          {opponentSide && <Opponent game={game} side={opponentSide} />}
          {!opponentSide && (
            <span className="truncate text-sm font-medium">
              {i18n._({
                ...GAME_ITEM_COPY.matchup,
                values: { white: game.whiteName, black: game.blackName },
              })}
            </span>
          )}
        </ItemTitle>

        <ItemDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="flex items-center gap-1.5">
            <SourceMark source={game.source} className="size-3.5" />
            <span>{GAME_SOURCES[game.source].label}</span>
            <PlayedColor perspective={game.perspective} />
          </span>

          <TimeControl game={game} />

          {game.openingName && (
            <span className="flex min-w-0 items-center gap-1.5">
              <BookOpen className="size-3.5 shrink-0" />
              <span className="truncate">{game.openingName}</span>
            </span>
          )}

          {playedAt && <span>{playedAt}</span>}
        </ItemDescription>
      </ItemContent>

      <ItemActions className="ml-auto shrink-0 gap-2 sm:gap-3">
        <OutcomeBadge game={game} />
        <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
      </ItemActions>
    </Item>
  );
}
