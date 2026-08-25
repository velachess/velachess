---
name: engine-analysis
description: Change or review VelaChess Stockfish execution, engine sessions, UCI scores, mate and centipawn normalization, side-to-move perspective, per-ply classification, analysis locking, queue execution, persistence, progress, retry, or re-analysis behavior. Use for libs/infra/engine, libs/analysis, application analysis slices, or worker analysis consumers.
---

# Work on engine analysis

Keep three concerns separate:

- `libs/infra/engine` owns UCI transport and session mechanics.
- `libs/analysis` owns pure score normalization and per-ply classification.
- `libs/application/analysis` owns execution, locking, persistence, progress,
  and the meaning of completion.

Prefer Stockfish/UCI and pg-boss primitives over local schedulers, polling,
timeouts, or retry frameworks. Keep classification pure and reproducible from
its explicit inputs.

Trace score point of view explicitly across UCI, normalization,
classification, persistence, and presentation. Preserve mate as a distinct
score shape. Delivery deduplication does not replace the database execution
lock, and queue state does not replace a persisted report as completion truth.
Do not make import or refresh an engine trigger. Preserve the transactional
pairs named in root `AGENTS.md`.

Canonical detail lives in `docs/reference/analysis.md`,
`docs/explanation/modules/analysis.md`, `docs/explanation/modules/engine.md`,
`docs/explanation/modules/queue.md`, and the live code/tests. Verify those
owners before changing an option, threshold, watchdog, retry, or persisted
shape.
