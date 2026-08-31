import type { JudgmentType } from "./judgment.ts";

/**
 * Aggregates judgments into adherence statistics. Faithfulness is about
 * the owner's own choices: only "deviation" (the owner left their own
 * line) counts as unfaithful. "gap" is the opponent leaving book,
 * "book-ended" is preparation running out, "completed" is a full match —
 * none of those are the owner's fault.
 *
 * Module-level pure policy — repertoires' own slices and
 * `@velachess/insights` reach it through this module's `index.ts`.
 */

export interface JudgmentRow {
  type: JudgmentType;
  inBookPlies: number;
  gamePlies: number;
  result?: "win" | "draw" | "loss";
}

interface OutcomeBucket {
  total: number;
  wins: number;
  draws: number;
  losses: number;
  /** wins / decided games in the bucket, 0 when none carry a result. */
  winRate: number;
}

export interface AdherenceMetrics {
  judgedGames: number;
  /** Below the minJudgedPlies floor — too short to say anything. */
  skippedGames: number;
  faithfulGames: number;
  adherenceRate: number;
  averagePrepDepth: number;
  inBook: OutcomeBucket;
  outOfBook: OutcomeBucket;
}

const DEFAULT_MIN_JUDGED_PLIES = 6;

function emptyBucket(): OutcomeBucket {
  return { total: 0, wins: 0, draws: 0, losses: 0, winRate: 0 };
}

function finishBucket(bucket: OutcomeBucket): OutcomeBucket {
  const decided = bucket.wins + bucket.draws + bucket.losses;
  return { ...bucket, winRate: decided === 0 ? 0 : bucket.wins / decided };
}

export function adherenceMetrics(
  rows: JudgmentRow[],
  opts: { minJudgedPlies?: number } = {},
): AdherenceMetrics {
  const floor = opts.minJudgedPlies ?? DEFAULT_MIN_JUDGED_PLIES;

  const judged = rows.filter((row) => row.gamePlies >= floor);
  const skippedGames = rows.length - judged.length;

  const inBook = emptyBucket();
  const outOfBook = emptyBucket();
  let faithfulGames = 0;
  let prepDepthSum = 0;

  for (const row of judged) {
    const faithful = row.type !== "deviation";
    if (faithful) faithfulGames++;
    prepDepthSum += row.inBookPlies;

    const bucket = faithful ? inBook : outOfBook;
    bucket.total++;
    if (row.result === "win") bucket.wins++;
    else if (row.result === "draw") bucket.draws++;
    else if (row.result === "loss") bucket.losses++;
  }

  return {
    judgedGames: judged.length,
    skippedGames,
    faithfulGames,
    adherenceRate: judged.length === 0 ? 0 : faithfulGames / judged.length,
    averagePrepDepth: judged.length === 0 ? 0 : prepDepthSum / judged.length,
    inBook: finishBucket(inBook),
    outOfBook: finishBucket(outOfBook),
  };
}
