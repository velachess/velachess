import type { DrillAnswer, DrillItem, DrillQueue } from "../queries.ts";
import { LANDING_OPPONENT } from "../../games/open-game/__fixtures__/landing-game-analysis.ts";

export const landingDrillQueue = {
  due: 6,
  fresh: 2,
  byOrigin: { "repertoire-deviation": 3, "engine-blunder": 5, "repertoire-line": 0 },
} satisfies DrillQueue;

export const landingDrill = {
  exerciseId: "22222222-2222-4222-8222-222222222222",
  fen: "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2",
  phase: "due",
  previews: {
    again: { due: "2026-08-24T09:30:00.000Z", intervalDays: 0.003 },
    hard: { due: "2026-08-25T09:30:00.000Z", intervalDays: 1 },
    good: { due: "2026-08-28T09:30:00.000Z", intervalDays: 4 },
    easy: { due: "2026-09-03T09:30:00.000Z", intervalDays: 10 },
  },
  context: {
    origin: "engine-blunder",
    playedSan: "g4",
    label: `Move 2 vs ${LANDING_OPPONENT}`,
  },
} satisfies DrillItem;

export const landingDrillAnswer = {
  correct: false,
  grade: "again",
  expectedSans: ["e4"],
  nextDue: "2026-08-24T09:30:00.000Z",
} satisfies DrillAnswer;
