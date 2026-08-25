# Diagnostic probes

Resolve a concrete identifier first and confirm current Drizzle table/column
names before adapting these read-only examples.

```sql
-- Judgment, report, and cached severity for one game.
select d.game_id, d.repertoire_id, d.type, d.ply, d.engine_category,
       (a.id is not null) as analyzed
from deviations d
left join game_analyses a on a.game_id = d.game_id
where d.game_id = '<game-id>';

-- Delivery attempts for one analysis, newest first.
select name, state, singleton_key, created_on
from pgboss.job
where name in ('analysis', 'analysis-dlq')
  and (singleton_key = '<game-id>' or data->>'gameId' = '<game-id>')
order by created_on desc;

-- Separate missing report from missing severity mapping.
select d.type, count(*) as total, count(a.id) as with_analysis,
       count(*) filter (where d.engine_category is not null) as with_severity
from deviations d
left join game_analyses a on a.game_id = d.game_id
group by d.type;
```

Before declaring a drill candidate missing, inspect `exercise_sources`: triage
is idempotent, so a source that already produced an exercise is correctly
absent from candidate queries.
