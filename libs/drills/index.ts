/**
 * [DRILLS] — what this module offers the rest of the system.
 *
 * Root index.ts is the public interface of a vertical/module/capability.
 * It is not a convenience barrel. See AGENTS.md "Modules and slices" for
 * what belongs here versus what stays a private slice file.
 *
 * `triageAndSeed` and `seedRepertoireLines` keep a `Database`-first
 * signature rather than a narrow declared-deps one: six composition roots
 * across five other modules (accounts/sync-account, games/{import-pgn,
 * judge-games}, analysis/{process-analysis,get-analysis}, repertoires/
 * {add-chapter,extract-repertoire}) each wire them directly with the
 * `Database` they already hold. See the doc comment on
 * `seed-exercises/seed-exercises.ts` for the full reasoning.
 */

export { getNextDrillForUser } from "./get-next-drill/get-next-drill.ts";
export type { GetNextDrillDeps } from "./get-next-drill/get-next-drill.ts";

export { countDrillQueue } from "./count-drill-queue/count-drill-queue.ts";
export type { CountDrillQueueDeps } from "./count-drill-queue/count-drill-queue.ts";

export { submitAnswer } from "./submit-answer/submit-answer.ts";
export type { SubmitAnswerDeps } from "./submit-answer/submit-answer.ts";

export { seedsFor, triageAndSeed } from "./seed-exercises/seed-exercises.ts";
export type { TriageOutcome } from "./seed-exercises/seed-exercises.ts";

export { seedRepertoireLines } from "./seed-exercises/seed-lines.ts";
