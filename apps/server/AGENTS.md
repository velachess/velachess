# Agent Guide — `apps/server`

Extends `../../AGENTS.md`. This app is the Hono HTTP composition root and
the only place transport concerns belong.

- Routes validate and translate HTTP, invoke one application slice, and map its
  outcome. Business workflows do not live here.
- HTTP-shape Zod stays in the route so the exported `AppType` client remains
  typed. Error responses follow `apps/server/src/validation.ts`'s `{ error,
details? }` contract.
- Every route must be represented in `src/openapi.ts`; the anti-drift suite in
  `tests/openapi.test.ts` checks both directions.
- Better Auth owns `/auth/*`. Session middleware resolves `userId`; downstream
  routes and slices never infer identity from a chess handle.
- Composition reads environment and constructs dependencies. Libraries receive
  validated injected configuration rather than reading ambient environment.
- Read `docs/explanation/apps/api.md` before changing the HTTP surface, auth
  order, analysis endpoints, or stream behavior.

Use `security-review` for auth, CORS, redirects, cookies, authorization, rate
limits, or outbound URLs. Use `architecture-review` when a route needs new
behavior rather than transport translation.
