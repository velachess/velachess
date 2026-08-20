import type { JudgmentRow } from "@velachess/repertoire";
import { and, eq, ne } from "drizzle-orm";

import type { Database } from "../client.ts";
import { deviations, games, trackedAccounts } from "../schema.ts";

type OwnerResult = "win" | "draw" | "loss" | undefined;
type Perspective = "white" | "black";

const PGN_RESULT = {
  draw: "1/2-1/2",
  whiteWin: "1-0",
  blackWin: "0-1",
} as const;

/** games.result is scored for white; the owner's outcome depends on which side they played. */
function ownerResult(result: string, perspective: string | null): OwnerResult {
  if (perspective !== "white" && perspective !== "black") return undefined;
  if (result === PGN_RESULT.draw) return "draw";
  if (result === PGN_RESULT.whiteWin) return perspective === "white" ? "win" : "loss";
  if (result === PGN_RESULT.blackWin) return perspective === "black" ? "win" : "loss";
  return undefined;
}

function derivedPerspective(input: {
  perspective: string | null;
  accountUsername: string | null;
  whiteName: string;
  blackName: string;
}): Perspective | null {
  if (input.perspective === "white" || input.perspective === "black") {
    return input.perspective;
  }

  const username = input.accountUsername?.toLowerCase();
  if (!username) return null;
  if (input.whiteName.toLowerCase() === username) return "white";
  if (input.blackName.toLowerCase() === username) return "black";
  return null;
}

/**
 * Judgment rows for one repertoire, joined with each game's result and
 * perspective, shaped for adherenceMetrics. Judgments without gamePlies
 * (predating the column) are excluded — the floor can't be applied to them.
 */
export async function getJudgmentRows(
  db: Database,
  repertoireId: string,
): Promise<JudgmentRow[]> {
  const rows = await db
    .select({
      type: deviations.type,
      inBookPlies: deviations.inBookPlies,
      gamePlies: deviations.gamePlies,
      result: games.result,
      perspective: games.perspective,
      whiteName: games.whiteName,
      blackName: games.blackName,
      accountUsername: trackedAccounts.username,
    })
    .from(deviations)
    .innerJoin(games, eq(deviations.gameId, games.id))
    .leftJoin(trackedAccounts, eq(games.accountId, trackedAccounts.id))
    // Unmatched games were never judged against a chapter — they carry
    // no faithfulness claim, so letting them through would count every
    // one as "faithful" and inflate adherence with games the book never
    // even spoke to.
    .where(
      and(eq(deviations.repertoireId, repertoireId), ne(deviations.type, "unmatched")),
    );

  return rows.flatMap((row) => {
    if (row.gamePlies === null) return [];
    // Synced games store no perspective — derive it from the tracked
    // username, same rule as application's resolveGamePerspective
    // (duplicated locally on purpose: db must not import application).
    const derived = derivedPerspective(row);
    const outcome = ownerResult(row.result, derived);
    return [
      {
        type: row.type as JudgmentRow["type"],
        inBookPlies: row.inBookPlies,
        gamePlies: row.gamePlies,
        ...(outcome ? { result: outcome } : {}),
      },
    ];
  });
}
