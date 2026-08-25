---
name: debug-pipeline
description: Diagnose inconsistent VelaChess state across account sync, normalization, repertoire judgment, Stockfish analysis, queue delivery, exercise seeding, and drill scheduling. Use for missing or stale judgments, stalled or failed analysis, unexpected null severity, duplicate or missing games, or an unexpectedly empty drill queue.
---

# Debug a cross-boundary inconsistency

Find the first boundary where an expected fact is absent. Start from a concrete
user, account, game, repertoire, or exercise identifier; do not diagnose from
an aggregate or queue state alone.

1. Read [references/pipeline-map.md](references/pipeline-map.md) for the current
   producer/consumer split, then confirm its paths in live code.
2. Load only the domain skills involved in the symptom: `game-ingestion`,
   `chess-domain`, `engine-analysis`, or `repertoire-training`.
3. Trace one identity outward through inputs, persistence, delivery, and derived
   records. Find the earliest missing or contradictory fact.
4. Use [references/probes.md](references/probes.md) only when database or queue
   evidence is needed. Confirm schema names before adapting a query and do not
   mutate production data during diagnosis.
5. Separate delivery evidence from domain truth and report confidence:

```text
CONFIRMED  supported by a named code path, test, log, or query
LIKELY     best explanation, one named verification away
POSSIBLE   plausible but not checked
RULED OUT  contradicted by named evidence
```

Close with the symptom, first broken boundary, evidence, and alternatives ruled
out. Diagnose only unless the user also requested a fix.
