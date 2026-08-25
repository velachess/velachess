---
name: repertoire-training
description: Change or review VelaChess repertoire extraction, chapters, habitual lines, judgment, deviations, engine-confirmed training candidates, exercise identity, drill selection, answers, cards, or FSRS scheduling. Use for libs/repertoire, libs/scheduler, repertoire or drill application slices, and product behavior connecting games to training.
---

# Work on repertoire and training

Preserve the product chain without collapsing its distinct meanings:

```text
owned games -> candidate repertoire -> judgment -> deviation/engine evidence
prepared chapter -> repertoire-line evidence
evidence -> exercise source -> exercise/card -> drill answer -> FSRS schedule
```

Read [references/repertoire-and-deviations.md](references/repertoire-and-deviations.md)
for extraction/judgment semantics and
[references/exercises-and-scheduling.md](references/exercises-and-scheduling.md)
for source identity, drill selection, and FSRS ownership.

Keep domain decisions pure in `libs/repertoire` or `libs/scheduler`; application
slices own persistence and effects. A repertoire judgment is replay against a
book, not Stockfish analysis. Exercise seeding is idempotent and may combine
repertoire and engine evidence without making them synonyms.

Use `chess-domain` for move/position/perspective rules and `engine-analysis`
for Stockfish/classification. Use `debug-pipeline` when the expected derived row
is missing rather than when a local pure rule is wrong.
