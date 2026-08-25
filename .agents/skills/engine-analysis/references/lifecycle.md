# Analysis lifecycle

The product trigger is an explicit request made while opening a game. The HTTP
route requests delivery; the worker executes Stockfish. Import, refresh, and
repertoire judgment do not fan analysis across an archive.

Execution ownership and delivery deduplication are distinct:

- pg-boss owns delivery state, retry, backoff, heartbeat, concurrency, and dead
  letters;
- a database session advisory lock owns one analysis execution across all
  callers;
- a completed `game_analyses` row is domain truth even if queue history has
  expired.

An execution first checks cached completion, acquires the lock, emits progress,
persists the report, and applies its engine signal. Report persistence and
severity fill are one transaction. If the report exists before judgment, the
later judgment must apply the cached signal transactionally.

Disconnecting a watcher does not cancel the run. HTTP state/progress readers
observe persisted state; they do not become a second engine owner.

Current operational depth, watchdog, engine binary, and retry counts live in
`libs/application/analysis/process-analysis`, `libs/infra/engine`, worker
composition, and `docs/reference/analysis.md`. Verify them before changing or
documenting a value.
