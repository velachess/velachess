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
import { GAME_MARKS, TIME_CLASS_MARKS } from "../game-marks.ts";
import { GAME_SOURCES } from "../game-sources.ts";
import { flairImageOf } from "../import/index.ts";
import { SourceMark } from "../source-mark.tsx";
import { formatClock } from "./game-presentation.ts";
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

const TIME_CLASS_LABELS: Record<TimeClass, MessageDescriptor> = {
  bullet: GAME_ITEM_COPY.bullet,
  blitz: GAME_ITEM_COPY.blitz,
  rapid: GAME_ITEM_COPY.rapid,
  classical: GAME_ITEM_COPY.classical,
};

const OUTCOME_BADGE = {
  win: { label: GAME_ITEM_COPY.win, variant: "success" },
  loss: { label: GAME_ITEM_COPY.loss, variant: "destructive" },
  draw: { label: GAME_ITEM_COPY.draw, variant: "secondary" },
  unfinished: { label: GAME_ITEM_COPY.unfinished, variant: "secondary" },
} as const;

const THUMBNAIL_COLUMNS = 4;
const THUMBNAIL_SQUARES = THUMBNAIL_COLUMNS * THUMBNAIL_COLUMNS;

/** A board with no position on it, until static FEN thumbnails exist. */
function BoardThumbnail() {
  return (
    <div
      aria-hidden
      className="grid size-14 shrink-0 grid-cols-4 grid-rows-4 overflow-hidden rounded-md border sm:size-20"
    >
      {Array.from({ length: THUMBNAIL_SQUARES }, (_, index) => (
        <div
          key={index}
          className={
            (Math.floor(index / THUMBNAIL_COLUMNS) + index) % 2 === 0
              ? "bg-board-light"
              : "bg-board-dark"
          }
        />
      ))}
    </div>
  );
}

function PlayedColor({ perspective }: { perspective: Game["perspective"] }) {
  const { i18n } = useLingui();
  if (perspective === null) return null;

  const playedWhite = perspective === "white";
  return (
    <>
      <span
        aria-hidden
        className={
          playedWhite
            ? "size-2.5 shrink-0 rounded-xs bg-foreground"
            : "size-2.5 shrink-0 rounded-xs border border-border bg-background"
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

  const Mark = TIME_CLASS_MARKS[timeClass];
  const clock = formatClock(
    game.timeControlInitialSeconds,
    game.timeControlIncrementSeconds,
  );
  return (
    <span className="flex items-center gap-1.5">
      <Mark className="size-3.5" />
      <span>{i18n._(TIME_CLASS_LABELS[timeClass])}</span>
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

function Matchup({ game }: { game: Game }) {
  const { i18n } = useLingui();

  return (
    <span className="truncate text-sm font-medium">
      {i18n._({
        ...GAME_ITEM_COPY.matchup,
        values: { white: game.whiteName, black: game.blackName },
      })}
    </span>
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
        <BoardThumbnail />
      </ItemMedia>

      <ItemContent className="min-w-0 gap-1.5">
        <ItemTitle className="w-full min-w-0">
          {opponentSide && <Opponent game={game} side={opponentSide} />}
          {!opponentSide && <Matchup game={game} />}
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
              <GAME_MARKS.opening className="size-3.5 shrink-0" />
              <span className="truncate">{game.openingName}</span>
            </span>
          )}

          {playedAt && <span>{playedAt}</span>}
        </ItemDescription>
      </ItemContent>

      <ItemActions className="ml-auto shrink-0 gap-2 sm:gap-3">
        <OutcomeBadge game={game} />
        <GAME_MARKS.review aria-hidden className="size-4 text-muted-foreground" />
      </ItemActions>
    </Item>
  );
}
