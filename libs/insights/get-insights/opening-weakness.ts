/**
 * Openings that score below the account holder's own overall win rate (their baseline, not an external standard).
 * One finding per qualifying opening — unlike other sources, these don't compete for one attention span.
 */

import { isDecided, isWin, winRate, type GameSample } from "./sample.ts";

interface OpeningWeaknessEvidence {
  openingName: string;
  /** ECO of the most recent game in the bucket, when recorded. */
  openingEco: string | null;
  games: number;
  winRate: number;
  baselineWinRate: number;
  baselineGames: number;
}

export interface OpeningWeaknessFinding {
  id: string;
  kind: "opening-weakness";
  section: "openings";
  evidence: OpeningWeaknessEvidence;
  /** baseline − opening win rate: the same per-game unit adherence uses. */
  weight: number;
}

/** Decided games an opening needs before its rate may speak —
 * `adherenceFinding`'s floor, reused deliberately. */
const MIN_GAMES_PER_OPENING = 5;
/** The baseline itself needs a real sample to be a baseline. */
const MIN_BASELINE_GAMES = 20;
/** Ten points below your own level — `adherenceFinding`'s delta floor. */
const MIN_WIN_RATE_DELTA = 0.1;

export function openingWeaknessFindings(
  games: readonly GameSample[],
): OpeningWeaknessFinding[] {
  const decided = games.filter(isDecided);
  const baseline = winRate(decided);
  if (baseline === null || decided.length < MIN_BASELINE_GAMES) return [];

  const byOpening = new Map<string, GameSample[]>();
  for (const game of decided) {
    if (!game.openingName) continue;
    const bucket = byOpening.get(game.openingName) ?? [];
    bucket.push(game);
    byOpening.set(game.openingName, bucket);
  }

  const findings: OpeningWeaknessFinding[] = [];
  for (const [openingName, bucket] of byOpening) {
    if (bucket.length < MIN_GAMES_PER_OPENING) continue;

    const rate = bucket.filter(isWin).length / bucket.length;
    const gap = baseline - rate;
    if (gap < MIN_WIN_RATE_DELTA) continue;

    findings.push({
      id: `opening-weakness:${openingName}`,
      kind: "opening-weakness",
      section: "openings",
      evidence: {
        openingName,
        openingEco: bucket.findLast((game) => game.openingEco)?.openingEco ?? null,
        games: bucket.length,
        winRate: rate,
        baselineWinRate: baseline,
        baselineGames: decided.length,
      },
      weight: gap,
    });
  }

  return findings;
}
