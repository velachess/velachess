import type { AdherenceMetrics } from "@velachess/repertoires";

/**
 * Adherence turned into one verdict: the win-rate direction (not assumed to
 * favor more book), or null below MIN_DECIDED_GAMES/MIN_WIN_RATE_DELTA rather
 * than assert a weak claim. One finding per repertoire, not per fact — same
 * story, same action.
 *
 * Named `adherence-finding.ts`, not `finding.ts`: this slice's own
 * envelope/ranking file already owns that name (see `./finding.ts`).
 */

/** Named locally rather than imported: `@velachess/repertoires`' index.ts
 * exports `AdherenceMetrics` but not its `inBook`/`outOfBook` bucket shape
 * on its own — this module has no wildcard path into that package to
 * reach it any other way. */
export type OutcomeBucket = AdherenceMetrics["inBook"];

export interface FindingSubject {
  repertoireId: string;
  name: string;
  color: "white" | "black";
}

/**
 * Which way the comparison went. The screen owns the sentence; this owns
 * which sentence, the way the drill prompt picks its lead from an origin.
 */
type AdherenceFindingKind = "book-advantage" | "book-disadvantage";

/**
 * What the reader is shown, and nothing else.
 *
 * Numbers only — no strings. Copy is Lingui's job in the file that
 * renders it, so a finding that carried a sentence would be a finding
 * that cannot be translated.
 */
interface FindingEvidence {
  /** Games decided (win/draw/loss recorded) inside the book. */
  inBookGames: number;
  inBookWinRate: number;
  outOfBookGames: number;
  outOfBookWinRate: number;
  judgedGames: number;
  adherenceRate: number;
  /** In plies, as the metrics report it — halving is the caller's call. */
  averagePrepDepth: number;
}

export interface AdherenceFinding {
  /** Stable across runs: one finding per repertoire, so the repertoire
   * identifies it. A key that moved between two fetches would remount a
   * card that did not change. */
  id: string;
  kind: AdherenceFindingKind;
  subject: FindingSubject;
  evidence: FindingEvidence;
  /**
   * How much this finding measured, 0..1 — the win-rate gap itself. Honest
   * only while this is the sole finding source; revisit ranking once a
   * second kind of finding needs comparable weight.
   */
  weight: number;
}

/**
 * Games a bucket must have decided before its win rate may speak.
 *
 * Five is low, and chosen to be low: the alternative is a screen that
 * stays empty for a month. It is a floor against nonsense, not a claim
 * of significance.
 */
const MIN_DECIDED_GAMES = 5;

/**
 * Below this the two rates are the same number wearing different hats.
 * A ten-point gap over five games is still thin; under ten points it is
 * not a finding in any sample this product will see.
 */
const MIN_WIN_RATE_DELTA = 0.1;

/** Games carrying an outcome — `total` also counts the ones that don't,
 * and a rate over twenty games where eighteen have no result is a rate
 * over two. */
function decided(bucket: OutcomeBucket): number {
  return bucket.wins + bucket.draws + bucket.losses;
}

/**
 * The finding for one repertoire, or null. Uses `adherenceMetrics`'s
 * winRate as-is (draw counts as a loss) rather than recomputing a
 * points-based rate, to avoid defining the same quantity two ways.
 */
export function adherenceFinding(
  subject: FindingSubject,
  metrics: AdherenceMetrics,
): AdherenceFinding | null {
  const inBookGames = decided(metrics.inBook);
  const outOfBookGames = decided(metrics.outOfBook);

  // Nothing to compare against: a book that was never left, or never
  // followed, has one bucket and no comparison to report.
  if (inBookGames < MIN_DECIDED_GAMES || outOfBookGames < MIN_DECIDED_GAMES) {
    return null;
  }

  const delta = metrics.inBook.winRate - metrics.outOfBook.winRate;
  if (Math.abs(delta) < MIN_WIN_RATE_DELTA) return null;

  return {
    id: subject.repertoireId,
    kind: delta > 0 ? "book-advantage" : "book-disadvantage",
    subject,
    evidence: {
      inBookGames,
      inBookWinRate: metrics.inBook.winRate,
      outOfBookGames,
      outOfBookWinRate: metrics.outOfBook.winRate,
      judgedGames: metrics.judgedGames,
      adherenceRate: metrics.adherenceRate,
      averagePrepDepth: metrics.averagePrepDepth,
    },
    weight: Math.abs(delta),
  };
}
