# Diagnostic probes

Resolve a concrete identifier first and confirm current Drizzle table/column
names in `libs/infra/db/schema.ts` before adapting these read-only examples.

```sql
-- Is there a persisted report for one game?
select g.id, a.id as analysis_id, a.engine_version, a.depth, a.created_at
from games g
left join game_analyses a on a.game_id = g.id
where g.id = '<game-id>';

-- Progress rows of the newest run for one game, in insertion order.
select run_id, index, total, seq
from analysis_progress
where game_id = '<game-id>'
order by seq desc;

-- Delivery attempts for one analysis, newest first.
select name, state, singleton_key, created_on
from pgboss.job
where name in ('analysis', 'analysis-dlq')
  and (singleton_key = '<game-id>' or data->>'gameId' = '<game-id>')
order by created_on desc;
```

Progress rows are deleted once the report lands, so rows without a report mean a
run in flight or a crashed one; a report without rows is the normal finished
state.
