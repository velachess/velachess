# Agent Guide — `libs/insights`

Extends `../../AGENTS.md`. Aggregates across games/repertoires/analysis on
its own reporting cadence — adherence findings, opening weaknesses,
performance trends, recurring mistakes — rather than living on any one of
those modules' endpoints.

`index.ts` exports: `listInsights`; types `GetInsightsDeps`. One slice, no
cross-module or route-facing surface beyond that.

Cross-module dependencies: depends on `@velachess/chess`,
`@velachess/infra-platforms`, and `@velachess/repertoires` — the last
declared as `ListRepertoiresWithAdherence`, narrowed to this module's own
`AdherenceSummary` shape (`{ color, adherenceRate }`) rather than
`repertoires`' full `RepertoireWithAdherence`.

No other business module depends on `@velachess/insights`.
