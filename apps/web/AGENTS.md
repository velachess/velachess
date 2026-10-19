# Agent Guide — `apps/web`

Extends `../../AGENTS.md`. Read that first; this file only states what's
different or additional for the frontend.

## Purpose

TanStack Start SPA, organized by vertical (what code does), never by
technical type — no `components/`, `hooks/`, `utils/` folders. The full
statement (slices, i18n, state, tests, `AppFrame`, `DataTable`, the
`beforeLoad` guard rule) lives in `docs/explanation/apps/web.md`; this file
does not restate it.

## Frontend Conventions

- No `shared/`. A grab-bag groups by technical type, which this app never
  does. Cross-vertical infrastructure gets its own vertical instead —
  `api/`, `backend-status/`, `chess-sounds/`, `query/` — named for what it
  does, same as any other slice.
- A vertical's public surface is its `index.ts`; a file inside it that
  isn't re-exported is private to that vertical. Dependency-cruiser
  enforces this (`web-vertical-index-only`, `web-vertical-no-cross-deep-imports`)
  for `api`, `backend-status`, `chess-sounds`, and `query`, and
  (`games-domain-index-only`, `games-domain-no-cross-deep-imports`) for the
  four domains under `games/` — `analysis`, `review`, `import`, `list`. A
  domain's sub-slice (`analysis/game/`, `import/pgn/`) is internal: its
  `index.ts` is a contract toward the rest of its domain, not toward the
  app. The remaining verticals (`auth`, `onboarding`, `settings`) may still
  be deep-imported from `routes/` until the same enforcement is scoped onto
  them too.
- `games/` is four domains and one shared file. Review consumes Analysis;
  Analysis never imports Review, `import` or `list`
  (`games-analysis-depends-on-no-sibling-domain`). Analysis interprets
  evaluations — `analysis/graded-game.ts` — and Review decides what a
  person sees — `review/move-presentation.ts`, `review/board-view.ts`. A
  `.ts` module in a domain stays React-free unless it is a `use-*.ts` hook
  (`games-domain-logic-stays-react-free`); the screens are `.tsx`. That
  shared file is `games/game-query-keys.ts` — the two prefixes all four
  spell identically, at their common ancestor rather than borrowed from
  whichever domain happened to declare one.
- `libs/` is reserved for thin third-party wrapper/facade files
  (`libs/zod.ts`, `libs/hono.ts`, `libs/react-query.ts`) — never a place
  for business logic. A facade re-exports its package under one name so a
  version bump or provider swap touches one file, enforced by
  dependency-cruiser (`web-facade-only-for-third-party-clients`): nothing
  outside `libs/` may import `zod`, `hono`/`hono/client`,
  `@tanstack/react-query`, `event-source-plus`, `idb`, or `effection`
  directly.
- `libs/ui` owns every design token; this app inherits the theme and
  never declares one.
- API responses are typed through `AppType` and `InferResponseType`. Do not
  re-parse one with Zod — the RPC link is the contract, and a second schema
  duplicates it rather than tightening it. Zod here is for URL search params and
  forms. Where a shape must still be re-declared (this app does not depend on
  `@velachess/infra-platforms`, and should not — it carries provider HTTP
  clients), tie the mirror back to `InferResponseType` so drift fails typecheck.
  See `docs/explanation/data-boundaries.md`.
- Two vocabularies, one boundary. Data keeps the domain's name (a
  `winChanceLoss` stays `winChanceLoss`); screens, routes and folders are
  named after the user's job — `games`, `import`, `settings`. A module usually spans several endpoints, so it
  is named for the job, not the endpoint. The mapping lives in the
  vertical's `queries.ts` and its message constants, and nowhere else.
- No literal text. Strings are Lingui messages declared with the `msg`
  macro, in the file that uses them, rendered through `i18n._(…)`.
  `aria-label`, `title` and `placeholder` count. Numbers and dates go
  through `Intl`. Run `pnpm --filter @velachess/web i18n:extract` after
  touching copy.
- State has four owners and they don't overlap: React Query for anything
  from the API, the URL for selection and filters, zustand for
  client-only preference that outlives a screen, `useState` for what dies
  with the component. Derive rather than store — no `useEffect` to keep
  two copies of the same fact in sync.
- One exception, and it has to earn the name: work this device is doing
  that outlives the screen watching it. Today that is exactly one thing,
  browser analysis, whose progress is neither server state nor a
  preference — `games/analysis/analysis-store.ts` holds it behind
  `useSyncExternalStore`, and `analysis/game/start-analysis.ts` owns its
  lifecycle. Reach for zustand for anything a user chose and this pattern only for
  something still running; a second one of these is a sign the boundary
  was drawn wrong.
- Structure enters a layout component through a slot, content through
  children. A screen returns content and never positions itself.
- A form with validation uses `@tanstack/react-form` (`useForm`, `form.Field`,
  `form.Subscribe`) with Zod validators, not hand-rolled `useState` +
  `safeParse` plumbing — see `settings/account/profile-form.tsx`,
  `games/import/accounts/connect-account.tsx`, and
  `games/import/pgn/pgn-import-dialog.tsx`.
  Per render: zod bakes error text in, so a schema needing copy takes a
  `translate` function and is built inside the component (`buildSchema(translate)`
  in `games/import/accounts/sources.ts`), never a module-level schema with
  English baked in. Render a field's error through `<FieldError errors={field.state.meta.errors} />`
  (plural, from the schema) rather than indexing `errors[0]` or branching text
  in JSX — a validator returning more than one message is for `FieldError` to
  show, not for the field to pick from.
- An event handler stays inline (`onChange={(e) => field.handleChange(e.target.value)}`)
  only while it does exactly one thing. The moment it does more than one —
  reads a second value, awaits something, branches — it becomes a named
  `handleXxx` function the prop references, never a multi-statement arrow
  function or a ternary written inline in the JSX.
- Tailwind: token utilities only. No arbitrary values, no `dark:` in a
  screen (that means a token is missing), no class built by concatenation
  — Tailwind reads source as text, so `bg-move-${x}` does not exist.

## Conditional rendering

No nested ternaries in JSX (`a ? x : b ? y : z`) — this repo's screens
consistently avoid them, this makes it explicit:

- `condition && <Component />` for an optional single branch.
- Explicit negated conditions for mutually exclusive branches
  (`{ok && <A/>}` next to `{!ok && <B/>}`), not a chained ternary.
- A value-producing conditional (not a JSX branch) extracts to a named
  function with early returns instead of a ternary chain. See
  `src/onboarding/onboarding-state.ts`'s `onboardingState()` (sequential
  `if (...) return` guards producing a discriminated union) for the
  pattern to follow.
- A ternary in a prop or a plain non-JSX expression is fine. JSX branches
  use the patterns above, and nested ternaries are never acceptable.

## Skills

- `.agents/skills/ui-before-you-build` (root) — read before writing any
  UI here: where components live, what to check before hand-rolling one.
- `libs/ui/.agents/skills/shadcn` — read it explicitly when changing the
  registry-owned component in `libs/ui`; this app only consumes
  `@velachess/ui` and does not own the shadcn installation.
