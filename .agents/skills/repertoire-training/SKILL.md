---
name: repertoire-training
description: Change or review VelaChess repertoire extraction, chapters, habitual lines, judgment, deviations, engine-confirmed training candidates, exercise identity, drill selection, answers, cards, or FSRS scheduling. Use for libs/repertoires, libs/drills, libs/scheduler, and product behavior connecting games to training.
---

# Work on repertoire and training

Preserve the product chain without collapsing its distinct meanings:

```text
owned games -> candidate repertoire -> judgment -> deviation/engine evidence
prepared chapter -> repertoire-line evidence
evidence -> exercise source -> exercise/card -> drill answer -> FSRS schedule
```

Keep pure policies at the module root (`libs/repertoires/tree.ts`,
`repertoire.ts`, `judgment.ts`, `adherence.ts`) or in `libs/scheduler`;
`libs/repertoires`/`libs/drills` slices own persistence and effects. A
repertoire judgment is replay against a book, not Stockfish analysis.
Exercise seeding is idempotent and may combine repertoire and engine
evidence without making them synonyms.

Before changing extraction, judgment, eligibility, queue selection, or FSRS
behavior, read the relevant canonical detail in `docs/reference/repertoire.md`,
`docs/reference/drills.md`, and their linked explanation pages, then verify the
live code and tests. Do not restate current sources, thresholds, reopening
sets, or ordering rules in this skill.

Use `chess-domain` for move/position/perspective rules and `engine-analysis`
for Stockfish/classification. Use `debug-pipeline` when the expected derived row
is missing rather than when a local pure rule is wrong.
