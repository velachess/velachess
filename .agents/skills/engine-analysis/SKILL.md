---
name: engine-analysis
description: Change or review VelaChess Stockfish execution, engine sessions, UCI scores, mate and centipawn normalization, side-to-move perspective, or per-ply classification. Use for libs/infra/engine, libs/analysis, or apps/web's browser-side analysis runner.
---

# Work on engine analysis

Keep two concerns separate:

- `libs/infra/engine` owns UCI transport and session mechanics, used by both
  `ChildProcessTransport` (no production caller, retained for tests/local
  use) and `WorkerTransport` (the browser).
- `libs/analysis` owns the pure algorithm (`process-analysis/analyze-game.ts`)
  and score normalization/classification at its module root. No
  persistence, no queue, no HTTP route — analysis runs entirely in
  `apps/web/src/games/browser-analysis/` (Stockfish WASM in a Web Worker),
  and a result lives only in that session's React Query cache.

Prefer Stockfish/UCI primitives over local schedulers, polling, timeouts, or
retry frameworks. Keep classification pure and reproducible from its
explicit inputs.

Trace score point of view explicitly across UCI, normalization,
classification, and presentation. Preserve mate as a distinct score shape.
Do not make import or refresh an engine trigger — the only trigger is
opening a game, client-side.

Canonical detail lives in `docs/reference/analysis.md` and the live
code/tests. Verify those owners before changing an option, threshold, or
watchdog.
