/**
 * [REPERTOIRES] — what this module offers the rest of the system.
 *
 * Root index.ts is the public interface of a vertical/module/capability.
 * It is not a convenience barrel. See AGENTS.md "Modules and slices" for
 * what belongs here versus what stays a private slice file.
 *
 * `ensureCandidateRepertoires` keeps a `Database`-first signature for its
 * own reads/writes, like `@velachess/drills`' `triageAndSeed`/
 * `seedRepertoireLines` — its callers (accounts/{connect-account,
 * sync-account}, games/import-pgn) are fully migrated and wire it through
 * their own declared dependency at the composition root. Its one external
 * need (drills' seeding) is an injected function, not a direct import —
 * see the doc comment on `extract-repertoire.ts` for the full reasoning.
 *
 * `buildRepertoire`/`judgmentType` are module-level pure policies (no
 * DB/queue dependency of their own) — every other module that needs them
 * (drills, games) imports them straight from here, no composition
 * required.
 */

export { createRepertoire } from "./create-repertoire/create-repertoire.ts";
export type {
  CreateRepertoireDeps,
  CreateRepertoireInput,
} from "./create-repertoire/create-repertoire.ts";

export { deleteRepertoire } from "./delete-repertoire/delete-repertoire.ts";
export type { DeleteRepertoireDeps } from "./delete-repertoire/delete-repertoire.ts";

export { getRepertoireDetail } from "./get-repertoire/get-repertoire.ts";
export type { GetRepertoireDeps } from "./get-repertoire/get-repertoire.ts";

export { listRepertoiresWithAdherence } from "./list-repertoires/list-repertoires.ts";
export type {
  ListRepertoiresDeps,
  RepertoireWithAdherence,
} from "./list-repertoires/list-repertoires.ts";

export { getChapterDetail } from "./get-chapter/get-chapter.ts";
export type { ChapterDetail, GetChapterDeps } from "./get-chapter/get-chapter.ts";
export type { ChapterLineView, ChapterStartView } from "./get-chapter/chapter-view.ts";

export { addChapter } from "./add-chapter/add-chapter.ts";
export type { AddChapterDeps, AddChapterOutcome } from "./add-chapter/add-chapter.ts";

export {
  ensureCandidateRepertoires,
  extractRepertoire,
  REPERTOIRE_NAME,
} from "./extract-repertoire/extract-repertoire.ts";
export type {
  ExtractColor,
  ExtractOutcome,
  ExtractRepertoireDeps,
} from "./extract-repertoire/extract-repertoire.ts";

export { buildRepertoire } from "./repertoire.ts";
export type { BuiltRepertoire } from "./repertoire.ts";
export type {
  IllegalRepertoireMove,
  RepertoireNodeData,
  RepertoireTree,
} from "./tree.ts";
export type { PositionIndex } from "./position-index.ts";

// Not in the plan's literal index.ts list, but genuinely needed beyond this
// module: games/judge-games's dispatch.ts/deviation.ts and
// drills/seed-exercises's seed-lines.ts/decision-positions.ts both walk a
// built repertoire's tree directly and need these exact shapes — the
// tsconfig path for this module is non-wildcard, so index.ts is the only
// way in from outside.

export { judgmentType } from "./judgment.ts";
export type { JudgmentType } from "./judgment.ts";

// Not in the plan's literal index.ts list, but genuinely needed beyond this
// module: libs/infra/db's own test suite (adherence-flow.test.ts) has no
// wildcard tsconfig path into this package (this module's paths entry is
// intentionally non-wildcard) and so cannot deep-import ./adherence.ts —
// exposing the function here is the only way to reach it from outside.
export { adherenceMetrics } from "./adherence.ts";
export type { AdherenceMetrics } from "./adherence.ts";
