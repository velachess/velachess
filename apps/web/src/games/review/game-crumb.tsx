import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Fragment, type ComponentType } from "react";

import { GAME_SOURCES } from "../game-sources.ts";
import type { Game } from "../list/index.ts";
import type { Seat } from "./board-view.ts";

const GAME_CRUMB_COPY = {
  // Opponent first, then you: the trail answers "which game is this?"
  // from your own seat.
  versusYou: msg`{opponent} vs you`,
  // Your seat is unknown (an unattributed PGN), so nobody is "you".
  matchup: msg`{white} vs {black}`,
} as const;

/** Between the facts in the trail — punctuation, not copy. */
const SEPARATOR = " · ";

interface CrumbPart {
  id: "matchup" | "date" | "source" | "result";
  text: string;
  /** Shown before the text when present; omitted otherwise. */
  Icon?: ComponentType<{ className?: string }>;
}

function playedOn(i18n: I18n, playedAt: string | null): string {
  if (!playedAt) return "—";
  return i18n.date(new Date(playedAt), {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

interface GameCrumbProps {
  game: Pick<Game, "source" | "result" | "playedAt">;
  white: string;
  black: string;
  /** `null` when nothing says which seat is yours — nobody is "you". */
  mySeat: Seat | null;
}

/** The last crumb of a game: who, when, where, and how it ended. */
export function GameCrumb({ game, white, black, mySeat }: GameCrumbProps) {
  const { i18n } = useLingui();

  const opponents = { white: black, black: white } as const satisfies Record<
    Seat,
    string
  >;
  const matchup = mySeat
    ? i18n._({
        ...GAME_CRUMB_COPY.versusYou,
        values: { opponent: opponents[mySeat] },
      })
    : i18n._({ ...GAME_CRUMB_COPY.matchup, values: { white, black } });

  const source = GAME_SOURCES[game.source];
  const parts: CrumbPart[] = [
    { id: "matchup", text: matchup },
    { id: "date", text: playedOn(i18n, game.playedAt) },
    { id: "source", text: source.label, Icon: source.Icon },
    { id: "result", text: game.result },
  ];

  return parts.map(({ id, text, Icon }, index) => (
    <Fragment key={id}>
      {index > 0 && SEPARATOR}
      {Icon && <Icon className="mr-1 inline size-4 align-text-bottom" />}
      {text}
    </Fragment>
  ));
}
