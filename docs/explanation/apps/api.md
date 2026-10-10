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
2. public system endpoints (`/health`, `/config`, `/openapi.json`);
3. Better Auth's `/auth/*` handler;
4. session resolution for every product route;
5. user-keyed API rate limiting and cost-specific limits;
6. product route groups.

Health and documentation remain available without a database-backed session.
The sign-in capability endpoint exposes booleans only. Better Auth owns its own
routes and throttling; the general API limiter sits after session resolution so
its key is the authenticated user.

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

`POST /accounts` creates/connects a tracked account and performs the initial
import synchronously so provider errors reach the person who submitted the
handle. `POST /accounts/:id/sync` performs an interactive refresh, enforces the
per-account cooldown, and returns `Retry-After` when called too soon. The worker
entry point remains available for refresh work no person is waiting on.

`POST /games/import` is the manual source: PGN text uploaded without any
connected account. It normalizes in-request, resolves the named player's seat
per game, and persists with user-scoped conflict-ignore (a duplicate-only upload
succeeds with counts) — never Stockfish.
`GET /games` is the unified library: one filtered page of every game the caller
owns across all sources, ownership read straight off `games.user_id`.

All import paths fetch or parse, normalize, and persist. None of them run
Stockfish; analysis starts only when a person asks for it.

## Analysis and progress

`POST /games/:id/analyze` is the explicit product trigger and requests pg-boss
delivery. The worker owns Stockfish execution. GET endpoints expose current
state and an EventSource-compatible stream over persisted progress/report
state; the API does not become a second execution owner.

SSE event names are namespaced and terminal frames close the connection.
`Last-Event-ID` resumes after the last observed ply, keep-alives prevent idle
proxy closure, and disconnect does not cancel analysis.

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
