import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Fragment, type ComponentType } from "react";

import { gameOutcomeFor, type GameResult } from "@velachess/chess";

import { GAME_SOURCES } from "../game-sources.ts";
import type { Game } from "../list/index.ts";
import type { Seat } from "./board-view.ts";

const GAME_HEADING_COPY = {
  // Opponent first, then you: the title answers "which game is this?"
  // from your own seat.
  versusYou: msg`{opponent} vs you`,
  // Your seat is unknown (an unattributed PGN), so nobody is "you".
  matchup: msg`{white} vs {black}`,
  win: msg`Win`,
  loss: msg`Loss`,
  draw: msg`Draw`,
  unfinished: msg`Unfinished`,
} as const;

/** Between the facts — punctuation, not copy. */
const SEPARATOR = " · ";

/** The scoresheet's own marks, typeset. */
const SCORE: Record<Exclude<GameResult, "*">, string> = {
  "1-0": "1–0",
  "0-1": "0–1",
  "1/2-1/2": "½–½",
};

interface Fact {
  id: "date" | "source" | "result";
  text: string;
  /** Shown before the text when present; omitted otherwise. */
  Icon?: ComponentType<{ className?: string }>;
}

function playedOn(i18n: I18n, playedAt: string | null): string {
  if (!playedAt) return "—";
  return i18n.date(new Date(playedAt), {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Whose win it was only once your seat is known; the score alone otherwise. */
function resultOf(i18n: I18n, result: GameResult, mySeat: Seat | null): string {
  if (result === "*") return i18n._(GAME_HEADING_COPY.unfinished);

  const outcome = gameOutcomeFor(result, mySeat);
  if (outcome === "unfinished") return SCORE[result];
  return `${SCORE[result]} ${i18n._(GAME_HEADING_COPY[outcome])}`;
}

export function gameTitle(
  i18n: I18n,
  white: string,
  black: string,
  /** `null` when nothing says which seat is yours — nobody is "you". */
  mySeat: Seat | null,
): string {
  if (!mySeat) return i18n._({ ...GAME_HEADING_COPY.matchup, values: { white, black } });

  const opponents = { white: black, black: white } as const satisfies Record<
    Seat,
    string
  >;
  return i18n._({
    ...GAME_HEADING_COPY.versusYou,
    values: { opponent: opponents[mySeat] },
  });
}

interface GameFactsProps {
  game: Pick<Game, "source" | "result" | "playedAt">;
  mySeat: Seat | null;
}

/** When, where, and how it ended. */
export function GameFacts({ game, mySeat }: GameFactsProps) {
  const { i18n } = useLingui();

  const source = GAME_SOURCES[game.source];
  const facts: Fact[] = [
    { id: "date", text: playedOn(i18n, game.playedAt) },
    { id: "source", text: source.label, Icon: source.Icon },
    { id: "result", text: resultOf(i18n, game.result, mySeat) },
  ];

  return facts.map(({ id, text, Icon }, index) => (
    <Fragment key={id}>
      {index > 0 && SEPARATOR}
      {Icon && <Icon className="mr-1 inline size-3.5 align-text-bottom" />}
      {text}
    </Fragment>
  ));
}
