# Agent Guide — `libs/repertoires`

Extends `../../AGENTS.md`. Owns the repertoire/chapter aggregate, its
adherence stats, and the module-root pure policies (`tree.ts`,
`position-index.ts`, `repertoire.ts`, `judgment.ts`, `adherence.ts`) that
turn a parsed PGN into a judgeable tree.

`index.ts` exports: `createRepertoire`, `deleteRepertoire`,
`getRepertoireDetail`, `listRepertoiresWithAdherence`, `getChapterDetail`,
`addChapter`, `extractRepertoire`, `ensureCandidateRepertoires`,
`REPERTOIRE_NAME`, `buildRepertoire`, `judgmentType`, `adherenceMetrics`;
types `CreateRepertoireDeps`, `CreateRepertoireInput`, `DeleteRepertoireDeps`,
`GetRepertoireDeps`, `ListRepertoiresDeps`, `RepertoireWithAdherence`,
`ChapterDetail`, `GetChapterDeps`, `ChapterLineView`, `ChapterStartView`,
`AddChapterDeps`, `AddChapterOutcome`, `ExtractColor`, `ExtractOutcome`,
`ExtractRepertoireDeps`, `BuiltRepertoire`, `IllegalRepertoireMove`,
`RepertoireNodeData`, `RepertoireTree`, `PositionIndex`, `JudgmentType`,
`AdherenceMetrics`.

No production dependency on any other business module —
`ensureCandidateRepertoires` takes drills' seeding function injected rather
than importing it directly; a `repertoires` ↔ `drills` package cycle is
not permitted.

Depended on by `games` and `drills` (`buildRepertoire`/`judgmentType` pure
policies, direct import) and `insights` (`listRepertoiresWithAdherence`,
narrowed to its own `AdherenceSummary` shape at the declared-dependency
boundary).
