import type { MoveSquares } from "@velachess/chess";

import { squaresOfSanAt } from "./move.ts";
import type { DrillItem } from "./queries.ts";

interface Answer {
  expectedSans: string[];
  correct: boolean;
}

interface AttemptView {
  fen: string;
  san: string;
  answer: Answer | null;
}

/**
 * What the session has counted so far.
 *
 * Session-scoped rather than read back from the server: these numbers
 * describe *this sitting*, and a card answered wrong here is still
 * "wrong today" even after the schedule moves it. The queue's own totals
 * answer a different question.
 */
export interface Session {
  /** Positions the sitting started with. */
  size: number;
  /** Answered right — the only way a position leaves the sitting. */
  right: number;
  /** Times a position was missed. Can exceed `size`: missing the same one
   * twice is two misses and one position still to go. */
  wrong: number;
  /**
   * Missed positions, waiting to be asked again before the sitting ends.
   *
   * Local on purpose. Nothing durable rides here — the answer was
   * recorded and the card scheduled the moment it was given, so closing
   * the tab loses no progress. What is lost is the intent to re-ask
   * *today*, and FSRS already put those cards a minute out, so they are
   * overdue and first in line whenever the person comes back.
   */
  retry: DrillItem[];
}

/** How many positions still have to be answered right. */
export function toGoIn(session: Session): number {
  return Math.max(0, session.size - session.right);
}

/**
 * One position leaves the screen.
 *
 * A right answer retires it; a wrong one sends it to the back of the
 * sitting. That is the whole of the repetition loop, and the reason a
 * hint would be redundant: being asked again *is* the help.
 */
export function advanced(
  session: Session,
  item: DrillItem,
  answer: Answer | null,
): Session {
  if (answer?.correct === true) {
    return { ...session, right: session.right + 1 };
  }
  return {
    ...session,
    wrong: session.wrong + 1,
    retry: [...session.retry, item],
  };
}

/**
 * The position the board shows.
 *
 * The move lands only once it is known to be right. Showing it the moment
 * it was dropped and rewinding on a wrong answer made the piece jump out
 * and back — the board asserting a move and then taking it away. Waiting
 * costs a beat on the correct case and never moves a piece that should
 * not have moved.
 */
export function boardFen(asked: string, attempt: AttemptView | null): string {
  return attempt?.answer?.correct === true ? attempt.fen : asked;
}

/**
 * The verdict, as two arrows and nothing else.
 *
 * Red from where your piece came to where you put it, green to where it
 * should have gone — the same grade colours the game report uses, so a
 * mistake looks the same in both places. No tick on the square: the green
 * arrow already lands there, and a second mark says the same thing twice.
 *
 * Nothing before the answer, because an arrow on an unanswered position
 * *is* the answer.
 */
export function verdictArrows(
  item: DrillItem,
  attempt: AttemptView | null,
): {
  playedMove?: MoveSquares;
  bestMove?: MoveSquares;
  lastMove?: MoveSquares;
  badges?: Record<string, { tone: "ok"; label: string }>;
} {
  const answer = attempt?.answer;
  if (!answer) return {};

  const played = squaresOfSanAt(item.fen, attempt.san);

  // Right: the move stays on the board, its squares lit and marked. No
  // arrows — there is nothing to contrast a correct move with.
  if (answer.correct) {
    return {
      ...(played ? { lastMove: played } : {}),
      ...(played ? { badges: { [played.to]: { tone: "ok" as const, label: "✓" } } } : {}),
    };
  }

  // Wrong: what you did in red, what was there in green.
  const best = squaresOfSanAt(item.fen, answer.expectedSans[0] ?? "");
  return {
    ...(played ? { playedMove: played } : {}),
    ...(best ? { bestMove: best } : {}),
  };
}
