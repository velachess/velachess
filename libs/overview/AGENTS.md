# Agent Guide — `libs/overview`

Extends `../../AGENTS.md`. Reads accounts/games/repertoires tables
directly for one dashboard aggregate, with zero dependency on any of
those modules' own packages — forcing this into one of them would be
arbitrary, since the aggregate belongs to none of them specifically.

`index.ts` exports: `getOverview`; types `GetOverviewDeps`, `Overview`,
`CountGames`, `CountDeviations`, `CountExercises`, `CountDueCards`.

No dependency on, and no dependent from, any other business module — this
module talks to `libs/infra/db` directly and nothing else.
