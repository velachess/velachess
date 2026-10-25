# `apps/server`

`apps/server` is the only HTTP composition root. Hono routes validate transport
shape, invoke one application slice, and translate its outcome to HTTP. Each
route declares its request and response shapes once, with `@hono/zod-openapi`'s
`createRoute`/`app.openapi()`; `GET /openapi.json` is generated from those
declarations, and the anti-drift test verifies every registered route and
documented operation in both directions.

## Middleware order

The order in `src/server.ts` is part of the security and availability contract:

1. request context, CORS, body limits, and CSRF protection;
2. public system endpoints (`/health/live`, `/health/ready`, `/config`,
   `/openapi.json`);
3. Better Auth's `/auth/*` handler;
4. session resolution for every product route;
5. user-keyed API rate limiting and cost-specific limits;
6. product route groups.

Health and documentation remain available without a database-backed session.
The sign-in capability endpoint exposes booleans only: `password`, `google`,
and `passwordReset` (true when email is configured). Better Auth owns its own
routes and throttling — password reset and email verification included, with no
email endpoint of ours; the general API limiter sits after session resolution so
its key is the authenticated user.

## Health

`GET /health/live` checks nothing. `GET /health/ready` runs `database`
(`select 1`), `migrations` (the latest bundled migration is recorded in
`drizzle.__drizzle_migrations`, drizzle's own rule) and `queue` (pg-boss
finds the `sync` queues) in parallel: `200` when all pass, `503` otherwise.
A check that has not answered after two seconds is reported as `timeout`;
the reason for a failure is logged, never returned. Redis is not checked:
the rate limiter fails open. Both routes sit above the session gate and the
limiter, so a probe is never refused.

## Rate limiting

`src/middleware/rate-limit.ts` applies one budget per policy and subject
(`api` per user, `import` per user and account) with `hono-rate-limiter` and
its `RedisStore`, so every API instance counts against the same Redis key.

- **Fixed window.** A subject's first request opens a window of
  `windowSeconds`; up to `max` requests pass inside it. Refused requests do not
  extend the window, and the full budget returns when it ends. A client can
  therefore spend up to `2 × max` across a window boundary.
- **Refusal.** `429` with `{ error: "too many requests", retryAfterSeconds }`
  and the same value in `Retry-After`, never `0`.
- **Fail open.** When Redis is unreachable the request is allowed and a
  warning is logged: an outage of the counter store must not take the API
  down with it.

## Identity and authorization

Better Auth resolves the session. Middleware passes only `userId` downstream;
application and database code never infer identity from a provider username.
User-owned queries scope through that id in SQL. Another user's UUID answers
like a missing UUID rather than disclosing existence.

Chess.com and Lichess handles identify public archive/profile data. Connecting
one creates a tracked account owned by the current VelaChess user. The same
public handle may be tracked independently by another user with its own cursor
and game rows.

## The avatar

`POST /me/avatar` takes the cropped image as base64 in a JSON body, small
enough to fit the global body limit unchanged — the browser re-encodes to a
512-square WebP first, so no multipart path and no raised ceiling. `POST`
rather than `PUT` because the server decides the resulting URL and returns
it. `DELETE /me/avatar` falls back to initials.

The bytes come back from `GET /me/avatar`, authenticated and self-scoped:
there is no id in the URL, so the storage key is derived from the session's
user and one user's read cannot reach another's object. There is no public
bucket and no signed URL.

Three properties of that read are security, not tuning. `Content-Type` is
sniffed from the stored bytes rather than echoed from whatever was uploaded.
`private` plus `Vary: Cookie` is what stops a shared cache answering one
user with another's picture, and `immutable` is only safe because the URL
carries a version that changes on every upload. A `default-src 'none';
sandbox` CSP, on top of the global `nosniff`, means a file that is both
valid image and valid markup can neither be read as a document nor execute.

Nothing re-encodes server-side — there is no image-processing dependency.
What stands in for sanitising is the sniff, the format allowlist, the size
ceiling, those headers, and the fact that the bytes only ever return to
their owner from an API that serves no HTML. The browser's canvas re-encode
also strips EXIF, so orientation and GPS never leave the device; a direct
API caller can still upload EXIF-bearing bytes, which are their own data
and returned only to them.

`users.image` holds the effective URL and `users.avatar_source` records who
last set it. Better Auth writes `image` once, when it creates the user from
an OAuth profile, and never again — both of its overwrite paths are opt-in
and unset, pinned by a test in `libs/infra/auth/tests/config.test.ts`. The
application owns the column after that.

## Import and refresh

No archive is fetched inside an HTTP request. `POST /accounts` confirms the
handle with one profile request — `404` when the provider has no such handle,
`503` when it cannot tell — then creates the account and its first sync job and
enqueues that job in one transaction, so a new account always has a sync
scheduled and a failed enqueue leaves no account; reconnecting the handle
already tracked answers `201` with `syncId: null` and schedules nothing. `POST /accounts/:id/sync` answers `202
{ syncId, status }`: the account's active job when it has one, otherwise a new
job after the per-account cooldown (`429` with `Retry-After` inside it).
`GET /syncs/:id` reports an owner's job — status, progress, error — and is what
clients poll; `GET /accounts` carries each account's `syncStatus`,
`activeSyncId` and `lastSyncError`. The worker does the fetching (see
`docs/reference/ingestion.md`).

`POST /games/import` is the manual source: PGN text uploaded without any
connected account. It normalizes in-request, resolves the named player's seat
per game, and persists with user-scoped conflict-ignore (a duplicate-only upload
succeeds with counts) — never Stockfish.
`GET /games` is the unified library: one filtered page of every game the caller
owns across all sources, ownership read straight off `games.user_id`.

All import paths fetch or parse, normalize, and persist. None of them run
Stockfish. Analysis has no endpoint here: it runs entirely in the browser
(Stockfish WASM, `apps/web/src/games/analysis/`), with no
persistence and no server/worker leg — see `docs/reference/analysis.md`.

## Sync events

`GET /syncs/events` is the session's one stream for syncs, with the same
conventions: `sync.completed` / `sync.failed` frames carrying the sync id,
keep-alives, no buffering. It is not derived from
polling rows: the transaction that settles a `sync_jobs` row notifies the
`sync_job_changed` Postgres channel with the job id, the api holds one `LISTEN`
on it (a dedicated connection, awaited at boot), and `watch-syncs` resolves
every id against the row before a user's stream sees it — the payload is
never trusted for ownership. Notifications are not durable, so no frame is a
record: a client that reconnects refreshes its accounts and games from the
rows, and when the api's own listener reconnects every open stream ends so
clients do the same. `GET /syncs/:id` stays for anything that prefers to ask.

## Validation and errors

Transport Zod stays in route files so the exported `AppType` client remains
typed. `src/validation.ts` maps validation to `{ error, details? }`; not-found,
HTTP exceptions, and opaque internal failures remain on the same JSON contract.
Internal exception details are logged rather than returned.

Routes migrated to `@hono/zod-openapi`'s `createRoute`/`app.openapi()` gain one
deliberate exception to that contract: a JSON-body route rejects a request
whose `Content-Type` is missing or doesn't match with `415`
(`{ "error": "Unsupported Media Type" }`), before the body is parsed at all —
the library's own built-in gate, not something this app added. Every real
client (`hono/client`'s `hc()`, which `apps/web` uses) always sets
`Content-Type: application/json` on a JSON body, so this never fires for
legitimate traffic; it only changes the answer to a request with no declared
media type, which previously fell through as an ordinary `{ error: "invalid
body" }` `400` (the body validated as if it were `{}`).

## Tests

Server tests call the real Hono app over the package harness with migrations,
queue, and engine dependencies appropriate to the behavior. OpenAPI tests pin
surface and error-shape drift. Cross-server/worker acceptance behavior lives in
root `e2e`. See `docs/how-to/write-a-test.md`.
