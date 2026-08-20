/**
 * Patterns across games, not per-game reports — ranked findings, each carrying its own evidence.
 * Interpretation lives here (not the screen) so ranking logic is testable and identical for every client.
 * Merges six sources into one list — the reason the endpoint exists, since cross-source ranking can't happen client-side.
 */

import type { Database } from "@velachess/db";
import { adherenceFinding } from "@velachess/repertoire";

import type {
  EvidenceCoverage,
  Finding,
  InsightsReport,
  SourceFinding,
} from "./finding.ts";
import { KIND_SCOPE, rankFindings } from "./finding.ts";
import { openingWeaknessFindings } from "./opening-weakness.ts";
import { performanceTrendFinding } from "./performance-trend.ts";
import { phasePerformanceFinding } from "./phase-performance.ts";
import { listInsightGames } from "./queries.ts";
import { recurringMistakeFinding } from "./recurring-mistake.ts";
import { winningPositionBlundersFinding } from "./winning-position-blunders.ts";
import { listRepertoiresWithAdherence } from "../../repertoires/list-repertoires/list-repertoires.ts";

/** Findings for the user, most measured first. Empty is a valid answer
 * and the common one early on — every source prefers silence to a claim
 * drawn from four games. */
export async function listInsights(
  db: Database,
  userId: string,
): Promise<InsightsReport> {
  const [repertoires, games] = await Promise.all([
    listRepertoiresWithAdherence(db, userId),
    listInsightGames(db, userId),
  ]);

  // The dataset behind this request, stated once on the envelope:
  // baseline facts consider every imported game, engine facts only the
  // analysed subset — and the answer says so even when it is empty.
  const analysed = games.filter((game) => game.plies !== null).length;
  const coverage: EvidenceCoverage = {
    gamesConsidered: games.length,
    deeplyAnalysedGames: analysed,
    coverage: games.length === 0 ? 0 : analysed / games.length,
  };

  const adherence: SourceFinding[] = repertoires.flatMap((repertoire) => {
    if (!repertoire.adherence) return [];
    const finding = adherenceFinding(
      {
        repertoireId: repertoire.id,
        name: repertoire.name,
        color: repertoire.color,
      },
      repertoire.adherence,
    );
    return finding ? [{ ...finding, section: "openings" as const }] : [];
  });

  const sources: SourceFinding[] = [
    ...adherence,
    ...openingWeaknessFindings(games),
    ...[
      phasePerformanceFinding(games),
      recurringMistakeFinding(games),
      winningPositionBlundersFinding(games),
      performanceTrendFinding(games),
    ].filter((finding): finding is NonNullable<typeof finding> => finding !== null),
  ];

  const findings: Finding[] = sources.map((finding) => ({
    ...finding,
    scope: KIND_SCOPE[finding.kind],
  }));

  return { coverage, findings: rankFindings(findings) };
}
