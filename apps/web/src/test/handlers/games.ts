import { http, HttpResponse } from "msw";

import {
  addGames,
  gameById,
  movetextOf,
  pgnImport,
  readArchive,
  seatIdentityFields,
} from "../archive.ts";
import { GAME_PGN } from "../games.ts";

/** The API's own default, so an unpaged read answers the same size. */
const DEFAULT_PAGE_SIZE = 25;

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

export const gamesHandlers = [
  http.get("/api/games", ({ request }) => {
    const query = new URL(request.url).searchParams;
    const outcome = query.get("outcome");
    if (outcome !== null && !["win", "loss", "draw"].includes(outcome)) {
      return HttpResponse.json({ error: "invalid query" }, { status: 400 });
    }

    const page = readArchive({
      color: query.get("color"),
      outcome,
      timeClass: query.get("timeClass"),
      page: positiveInt(query.get("page"), 1),
      pageSize: positiveInt(query.get("pageSize"), DEFAULT_PAGE_SIZE),
    });

    return HttpResponse.json(page);
  }),

  http.post<
    never,
    {
      pgn?: string;
      participation?:
        | { mode: "white" }
        | { mode: "black" }
        | { mode: "byName"; playerName?: string };
    }
  >("/api/games/import", async ({ request }) => {
    const body = await request.json();
    const validParticipation =
      body.participation?.mode === "white" ||
      body.participation?.mode === "black" ||
      (body.participation?.mode === "byName" &&
        Boolean(body.participation.playerName?.trim()));

    if (!body.pgn?.trim() || !validParticipation) {
      return HttpResponse.json({ error: "invalid body" }, { status: 400 });
    }

    if (pgnImport.refuses) {
      return HttpResponse.json({ error: "import failed" }, { status: 503 });
    }

    addGames(...pgnImport.incoming);
    return HttpResponse.json({
      imported: pgnImport.incoming.length,
      duplicates: pgnImport.duplicates,
      rejected: pgnImport.rejected,
    });
  }),

  http.get("/api/games/:id", ({ params }) => {
    const game = gameById(String(params["id"]));
    if (!game) return HttpResponse.json({ error: "game not found" }, { status: 404 });
    return HttpResponse.json({
      ...game,
      ...seatIdentityFields(String(params["id"])),
      openingEco: "C20",
      termination: "by resignation",
      rawPgn: movetextOf(String(params["id"])) ?? GAME_PGN,
    });
  }),
];
