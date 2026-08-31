/**
 * ListDeviations — the user's own book-departures, newest first, with
 * enough context to render a row and a board.
 */
import { epdToFen } from "@velachess/chess";

export interface DeviationRow {
  id: string;
  gameId: string;
  ply: number | null;
  playedSan: string | null;
  expectedSans: string[] | null;
  positionKey: string | null;
  cpLoss: number | null;
  engineCategory: string | null;
  drillable: boolean;
  repertoireName: string;
  chapterName: string | null;
  whiteName: string;
  blackName: string;
  result: string;
  playedAt: Date | null;
  openingName: string | null;
  gameUrl: string | null;
  drilled: boolean;
}

export type ListOwnDeviations = (userId: string) => Promise<DeviationRow[]>;

export interface ListDeviationsDeps {
  listOwnDeviations: ListOwnDeviations;
}

/** The deviation table a UI renders. positionKey is an EPD; the board
 * wants a playable FEN. */
export async function listDeviationsForUser(deps: ListDeviationsDeps, userId: string) {
  const rows = await deps.listOwnDeviations(userId);

  return rows.map(({ positionKey, ...row }) =>
    Object.assign({}, row, {
      fen: positionKey ? epdToFen(positionKey) : null,
    }),
  );
}
