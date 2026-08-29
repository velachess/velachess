# libs/test-utils

**Shared test infrastructure for every suite above `libs/infra/db`.**
Before it existed, the loop harness (PGlite + real migrations + started
pg-boss + advisory lock), the Stockfish session factory, the looper
fixture fetch, and the poll helper were each duplicated three to five
times across the application, api, worker, and queue suites. One
definition now; the suites import it.

Test-only by contract: no production entrypoint may import this package.
It depends on `application`, `queue`, `db`, `engine`, and `fixtures` —
which is why `libs/infra/db` keeps its own dual-backend test helper
(`tests/test-db.ts`, DATABASE_URL or PGlite): db sits _below_ this
package, and its tests reaching up the layering would invert it.

## Layout

```
db.ts        createTestDb — PGlite + drizzle + the real migrations
harness.ts   createLoopHarness (db + started boss with queues ensured +
             ports + advisory lock), startBoss, pgliteLock
engine.ts    makeStockfishSession — real engine, child-process transport
fetch.ts     chessComFixtureFetch — serves the looper scenario from
             @velachess/fixtures (pure data stays there)
poll.ts      poll(fn, timeout) — wait for the worker's background cascade
             without sleeping blind
index.ts     public surface
```

## Who uses what

- `libs/infra/queue` tests — createTestDb, startBoss
- `libs/application` tests — createLoopHarness, makeStockfishSession,
  chessComFixtureFetch
- `apps/server` tests — a thin `ApiHarness` composes createLoopHarness +
  `createApp`; e2e adds poll and the fixture fetch
- `apps/worker` tests — createLoopHarness, makeStockfishSession, poll,
  chessComFixtureFetch
