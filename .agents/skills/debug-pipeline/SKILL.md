---
name: debug-pipeline
description: Root-cause investigation of VelaChess's sync → judge → analysis → triage → review pipeline. Use when data looks inconsistent — zero triage candidates, deviations without severity, games never re-judged, queue jobs stuck or dead-lettered.
---

# Debug the pipeline

Evidence before hypothesis. Never conclude a component is broken because
an intermediate endpoint returned zero.

## 1. Reconstruct the real path (function + file)

```
POST /accounts/:id/sync → worker consumeSyncJob → processAccountSync (application/sync.ts)
  → syncAccount → saveGames → judgeGamesForUser (application/judge.ts)
    → listUnjudgedGames(userId, repertoireId)   PER REPERTOIRE — a game is
      pending for repertoire R until R judged it
    → upsertJudgment + enqueue analysis (one tx); if a cached analysis
      exists, severity fills in the SAME tx and nothing is enqueued
worker consumeAnalysisJob → completeAnalysis (application/analyze.ts)
  → tryStartAnalysis (advisory lock owns execution) → saveAnalysis +
    applyEngineSignal for existing judgments (one tx)
judge / analysis complete → triageAndSeed → listTriageCandidates
                                              + listEngineDrillCandidates
  (REQUIRES engine_category NOT NULL and a live repertoire join)
```

## 2. Known traps (all hit in production before)

- Judge ran before chapters existed → everything skipped, zero rows.
- `engine_category` null on every deviation → triage sees zero. Ordering
  matters: judgments created AFTER a cached analysis are filled by the
  judge; judgments existing at completion time are filled by completion.
- Deleting a repertoire orphans its judgments (`repertoire_id` → null);
  triage's inner join ignores orphans by design.
- Deviation at ply 1 with a sound alternative move → `ok` → not drillable
  (by design: harmless deviations don't drill).
- Shell quoting: `curl .../judge\; echo` sends the `;` in the URL → 404.

## 3. Diagnostic queries (psql via compose)

```sql
-- deviations × analysis × severity, by type
select d.type, count(*) total, count(a.id) with_analysis,
       count(*) filter (where d.engine_category is not null) with_severity
from deviations d join games g on g.id=d.game_id
left join game_analyses a on a.game_id=d.game_id group by d.type;

-- delivery truth (pg-boss)
select state, count(*) from pgboss.job where name='analysis' group by state;
select count(*) from pgboss.job where name='analysis-dlq' and state != 'completed';

-- severity distribution (distinguishes "all ok" from "never filled")
select engine_category, count(*) from deviations
where type='deviation' group by engine_category;
```

## 4. Classify every conclusion

```
CONFIRMADO   backed by code read or query result — cite it
PROVÁVEL     best explanation, one verification away
POSSÍVEL     plausible, not yet checked
DESCARTADO   ruled out — say by what evidence
```

## 5. Close with

```
ROOT CAUSE / EVIDENCE (numbered) / PIPELINE BREAKS HERE (diagram with [X])
/ FIX (smallest possible) / VERIFICATION (command → expected → endpoint)
```

No fix without a confirmed cause. YAGNI: no new abstractions to fix a
localized bug.
