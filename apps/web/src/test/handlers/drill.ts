import { http, HttpResponse } from "msw";

/** Full drill loop with work waiting; 204 from `next` is a real "nothing due" answer, not a failure. */
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const drillQueue = {
  due: 7,
  fresh: 5,
  byOrigin: { "repertoire-deviation": 4, "engine-blunder": 9 },
};

export const drillItem = {
  exerciseId: "11111111-1111-1111-1111-111111111111",
  fen: START,
  phase: "new" as const,
  previews: {
    again: { due: "2026-08-16T00:10:00.000Z", intervalDays: 0.007 },
    hard: { due: "2026-08-16T00:06:00.000Z", intervalDays: 0.004 },
    good: { due: "2026-08-20T00:00:00.000Z", intervalDays: 4 },
    easy: { due: "2026-08-25T00:00:00.000Z", intervalDays: 9 },
  },
  context: {
    origin: "repertoire-deviation" as const,
    playedSan: "Nf3",
    label: "Queen's pawn — chapter 3",
  },
};

export const drillHandlers = [
  http.get("/api/drill/queue", () => HttpResponse.json(drillQueue)),
  http.get("/api/drill/next", () => HttpResponse.json(drillItem)),
  http.post("/api/drill/answer", async ({ request }) => {
    const body = (await request.json()) as { san: string };
    return HttpResponse.json({
      correct: body.san === "d4",
      grade: body.san === "d4" ? "good" : "again",
      expectedSans: ["d4"],
      nextDue: "2026-08-20T00:00:00.000Z",
    });
  }),
];
