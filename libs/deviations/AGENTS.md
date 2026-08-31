# Agent Guide — `libs/deviations`

Extends `../../AGENTS.md`. Single slice, zero fan-out: its own read of the
judgment table for one user.

`index.ts` exports: `listDeviationsForUser`; types `ListDeviationsDeps`,
`ListOwnDeviations`, `DeviationRow`.

No dependency on, and no dependent from, any other business module — this
module talks to `libs/infra/db` directly and nothing else.
