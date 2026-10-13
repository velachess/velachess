# Diagnostic probes

Resolve a concrete identifier first and confirm current Drizzle table/column
names in `libs/infra/db/schema.ts` before adapting these read-only examples.

Analysis has no server-side state to probe — it runs entirely in the browser
and persists nothing (`docs/reference/analysis.md`). A reported analysis
bug is a browser issue (console, network tab for the engine WASM asset),
not a database or queue one.

```sql
-- Delivery attempts for one account's sync, newest first.
select name, state, singleton_key, created_on
from pgboss.job
where name in ('sync', 'sync-dlq')
  and singleton_key = '<account-id>'
order by created_on desc;

-- A tracked account's own sync status, the domain truth pg-boss delivery feeds.
select id, status, started_at, error_code
from sync_jobs
where account_id = '<account-id>'
order by created_at desc;
```
