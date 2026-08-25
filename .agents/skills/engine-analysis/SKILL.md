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

Read only the detail needed:

- [references/evaluation.md](references/evaluation.md) for score POV, mate,
  win-chance loss, and categories.
- [references/lifecycle.md](references/lifecycle.md) for trigger, queue, lock,
  persistence, retries, and progress.

Prefer Stockfish/UCI and pg-boss primitives over local schedulers, polling,
timeouts, or retry frameworks. Keep classification pure and reproducible from
its explicit inputs. Do not make import or refresh an engine trigger.

When changing a current engine option, depth, watchdog, transport, or dependency
API, verify live code and `docs/reference/analysis.md`; those operational values
may change faster than this procedure.
