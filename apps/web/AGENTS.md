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

- `libs/ui` owns every design token; this app inherits the theme and
  never declares one.
- Two vocabularies, one boundary. Data keeps the domain's name (a
  `deviation` is a deviation, `engineCategory` stays `engineCategory`);
  screens, routes and folders are named after the user's job — `mistakes`,
  `drill`, `repertoire`. A module usually spans several endpoints, so it
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
- Structure enters a layout component through a slot, content through
  children. A screen returns content and never positions itself.
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
  `src/onboarding/dashboard-state.ts`'s `dashboardState()` (five
  sequential `if (...) return` guards producing a discriminated union) and
  `src/dashboard/dashboard.tsx`'s `Counters`/`CounterCardValue`/
  `CounterValue` (each a 2-3-way branch via sequential early returns) for
  the pattern to follow.
- A ternary in a prop or a plain non-JSX expression is fine. JSX branches
  use the patterns above, and nested ternaries are never acceptable.

## Skills

- `.agents/skills/ui-before-you-build` (root) — read before writing any
  UI here: where components live, what to check before hand-rolling one.
- `libs/ui/.agents/skills/shadcn` — read it explicitly when changing the
  registry-owned component in `libs/ui`; this app only consumes
  `@velachess/ui` and does not own the shadcn installation.
