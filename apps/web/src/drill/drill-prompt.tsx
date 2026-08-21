import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { sideToMove as sideToMoveOf } from "./move.ts";
import type { DrillItem } from "./queries.ts";

/**
 * The sentence that explains a drill, which is not the same sentence for
 * both origins.
 *
 * "Your preparation said Nc3" is a claim about a decision you made; "the
 * engine preferred Nc3" is a claim about the position. Saying the wrong
 * one either credits you with a plan you never had, or reduces your own
 * repertoire to an engine opinion.
 */
const PROMPT_COPY = {
  fromBook: msg`Your preparation said`,
  fromEngine: msg`The engine preferred`,
  neutral: msg`The move here is`,
  played: msg`In the game, you played`,
  askBook: msg`Play the move you prepared.`,
  askEngine: msg`Find a better move than the one you played.`,
  askNeutral: msg`Find the best move.`,
  whiteToMove: msg`White to move`,
  blackToMove: msg`Black to move`,
  seenBefore: msg`Seen before`,
  firstTime: msg`First time`,
} as const;

/**
 * Which sentence each origin earns, as a lookup rather than a chain of
 * ternaries. The mapping is the decision worth reading; nesting it in
 * conditionals buries it in syntax.
 */
const LEAD_BY_ORIGIN = {
  "repertoire-deviation": PROMPT_COPY.fromBook,
  "engine-blunder": PROMPT_COPY.fromEngine,
  // A line drill's answer IS the preparation — same voice as a deviation,
  // it just wasn't provoked by a game.
  "repertoire-line": PROMPT_COPY.fromBook,
} as const;

/**
 * What is being asked, which is not the same question for both origins.
 *
 * A repertoire drill asks you to *recall* a decision you already made. An
 * engine drill asks you to *find* something better than what you played —
 * you never meant to play anything there. One instruction for both told
 * half the drills to remember a plan that never existed.
 */
const ASK_BY_ORIGIN = {
  "repertoire-deviation": PROMPT_COPY.askBook,
  "engine-blunder": PROMPT_COPY.askEngine,
  // Recall of a decision, exactly like a deviation — the difference is
  // only what put it in the queue.
  "repertoire-line": PROMPT_COPY.askBook,
} as const;

export interface DrillPromptProps {
  item: DrillItem;
  /** Revealed only after an answer — before that it is the question. */
  answer: { expectedSans: string[]; correct: boolean } | null;
}

export function DrillPrompt({ item, answer }: DrillPromptProps) {
  const { i18n } = useLingui();

  if (!answer) return <Question item={item} />;

  const origin = item.context?.origin;
  // No origin means no claim to make about whose move this checks.
  const lead = origin ? LEAD_BY_ORIGIN[origin] : PROMPT_COPY.neutral;

  return (
    <div className="flex flex-col gap-1">
      <PlayedMove playedSan={item.context?.playedSan} />
      <p className="text-muted-foreground text-sm">
        {i18n._(lead)} <code className="text-foreground">{answer.expectedSans[0]}</code>.
      </p>
      <ContextLabel label={item.context?.label} />
    </div>
  );
}

function PlayedMove({ playedSan }: { playedSan: string | null | undefined }) {
  const { i18n } = useLingui();

  if (!playedSan) return null;

  return (
    <p className="text-sm">
      {i18n._(PROMPT_COPY.played)} <code>{playedSan}</code>.
    </p>
  );
}

function ContextLabel({ label }: { label: string | null | undefined }) {
  if (!label) return null;
  return <p className="text-muted-foreground text-xs">{label}</p>;
}

/**
 * The question.
 *
 * No hint button. In a repetition loop the second pass *is* the hint —
 * a wrong answer returns the same position later, which is the help
 * spaced repetition is built to give. A lamp beside the board offers the
 * same help earlier and cheaper, and takes the difficulty that makes the
 * repetition worth anything.
 *
 * The provenance is held back for the same reason it was held back
 * behind the button: naming the chapter narrows the answer. It arrives
 * with the answer instead.
 */
function Question({ item }: { item: DrillItem }) {
  const { i18n } = useLingui();
  const origin = item.context?.origin;
  const ask = origin ? ASK_BY_ORIGIN[origin] : PROMPT_COPY.askNeutral;
  const sideToMove =
    sideToMoveOf(item.fen) === "white"
      ? PROMPT_COPY.whiteToMove
      : PROMPT_COPY.blackToMove;
  const phase = item.phase === "due" ? PROMPT_COPY.seenBefore : PROMPT_COPY.firstTime;

  return (
    <div className="flex flex-col items-start gap-3">
      {/* Whose move it is, and whether this is a first sighting. Neither
          narrows the answer — they say what the question is and how much
          of it you are expected to already know. */}
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <span>{i18n._(sideToMove)}</span>
        <span aria-hidden="true">·</span>
        <span>{i18n._(phase)}</span>
      </div>

      <p className="text-sm">{i18n._(ask)}</p>
    </div>
  );
}
