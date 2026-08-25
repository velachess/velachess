# Provider and cursor semantics

Both archives are public data sources; neither provider username authenticates
the VelaChess user.

## Chess.com

- Validate the handle, fetch the real archive index, and request archive months
  sequentially; parallel month fetches invite provider throttling.
- Initial sync uses the current bounded bootstrap window in the provider code.
- The cursor records the last fully processed archive/month position. A failed
  month or normalization failure prevents cursor advance past the incomplete
  pass.

## Lichess

- Export is requested as PGN and normalized through the shared PGN path.
- The cursor is a timestamp boundary advanced from successfully normalized
  games. An HTTP/rate-limit or normalization failure keeps the old cursor and
  marks the pass incomplete.
- Empty successful PGN is a complete pass with no new games, not an error.

## Shared behavior

- Unsupported variants are recorded as failures rather than coerced into
  standard chess.
- `lastSyncedAt` and cursor advance only on a complete pass; successful rows
  from a partial pass remain safely deduplicated for retry.
- Interactive refresh currently enforces a per-account cooldown and returns
  `Retry-After` when too soon. Confirm the current constant and transport
  mapping in live code before relying on its numeric value.
- Provider response schemas, URL construction, headers, and rate behavior can
  change. Verify current client code and provider documentation when a change
  depends on them.
