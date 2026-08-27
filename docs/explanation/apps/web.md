# apps/web — the frontend

The SPA. TanStack Start in `spa` mode, React Query for server state, and
one design system in `@velachess/ui`.

Turning SSR on later is a flag on the Start plugin, not a rewrite — that
is why Start is here instead of plain Vite.

## Slices are domains

`src/` has one folder per **domain**, and everything belonging to that
domain lives inside it. There is no `components/`, `hooks/` or `utils/`
folder: those group by technical type, which puts `useTheme` next to
`useGame` and the two never change together.

```
src/
  app-shell/    frame assembly: navigation as data, the layout routes use
  auth/         session, sign-in, sign-out and user presentation
  i18n/         locale resolution and catalogue activation
  dashboard/    the overview
  games/        everything you do to games
    import/       connect an account and pull games in
    list/         filter and page owned games
    open-game/    load the playable game record
    request-analysis/ view-analysis/ watch-analysis/
  insights/     findings derived from owned games and analysis
  repertoire/   the lines you actually play
  drill/        spaced repetition over your worst mistakes
  settings/     account and product preferences
  routes/       routing only — a route imports a slice and mounts it
  shared/       cross-vertical transport/query/error infrastructure only
```

Importing and analysis are things you do _to games_, so they nest under
`games/` rather than sitting beside it — the folder says what the behavior
belongs to, not merely that it exists.

A slice owns its data (`queries.ts`), its screen, its constants and its
tests. It never positions itself on the page — it returns content, and the
shell decides where that content goes.

## Two vocabularies, one boundary

Data keeps the domain's name; screens are named after the user's job.

| The API says   | The person sees             | Why                                                                                        |
| -------------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| `deviation`    | Deviations on the dashboard | The overview names this exact repertoire count; task-focused flows can still say Mistakes. |
| `review` (SRS) | Drill                       | In chess products "Game Review" means analyzing a game — the collision is real.            |
| `repertoire`   | Repertoire                  | Same word on both sides, and that's fine: it's a word players use, not a mechanism.        |

The rule is not "always differ" — it is "don't ship the mechanism's word
to the user unless the screen names that exact metric". The mapping happens
once, at the edge, inside the slice.

## State: four owners, no overlap

- **React Query** — everything that comes from the API. The only source of
  server state.
- **URL** — selection, filters, pagination. Anything that must survive a
  refresh, a shared link, or the back button. Routes declare it with
  `validateSearch` and a zod schema; every field `.catch()`es a default,
  because that schema runs before any component exists and a throw there
  blanks the screen instead of showing an unfiltered list.
- **Zustand** — client-only state that outlives a screen: the selected
  import source, and (persisted) which accounts this device imported.
- **`useState`** — what dies with the component (text being typed).

Derive instead of storing: the active nav item comes from the pathname,
the Review badge from the stats cache. Nothing to desync, and no
`useEffect` to keep them honest.

## The frame and the gate

`AppFrame` (in `@velachess/ui`) takes navigation through a slot and
content as children. Region budgets and the responsive contract live in
`libs/ui`, next to the components that implement them.

`_app` is the authenticated product. Its layout `beforeLoad` resolves the
Better Auth session through the query cache and redirects unauthenticated
visitors to `/login`, preserving the requested path. `/login` mirrors the
guard and sends an authenticated visitor back to the product.

Guards run before components exist, so session resolution returns a defined
authenticated/unauthenticated state instead of leaking a rejected query. The
login redirect search value accepts only an on-site path; `//host` and absolute
URLs are rejected so it cannot become an open redirect.

Onboarding is an overlay at the authenticated layout boundary, not a second
identity system. `/import` stays reachable inside the product so a user can add
another tracked account.

## Identity

Three facts stay separate:

1. **Session user** — established by Better Auth and authoritative for every
   product request.
2. **Tracked account** — a chess.com/Lichess handle connected to that user.
   Uniqueness and sync cursor are user-scoped, so two users may independently
   track the same public handle.
3. **Provider profile** — public avatar/flair metadata cached by provider and
   handle. It is shared public data, not ownership or authentication.

React Query owns session and account data. A 401 clears the cached session and
returns the browser to login; local storage does not claim identity. Account
authorization remains server-side and user-scoped in database queries.

## Tables

`DataTable` in `@velachess/ui` is the reusable half only — TanStack Table
stays headless and the component renders what it hands back. Columns,
filters and copy belong to the screen, which is why `games/list` owns its
`columns.tsx` and the library owns none of it.

Everything runs in manual mode: the server filters and pages, so the table
is told the row count instead of deriving one. TanStack Table v9 tree-shakes
any feature you don't register — including the API that reads cells, so
`columnVisibilityFeature` is registered even though nothing toggles columns
yet.

A screen with a pager is two regions, and only one scrolls: the table sits
in a `min-h-0 flex-1 overflow-auto` box, the pager below it. Both pieces
matter. `min-h-0` is what allows a flex child to be shorter than its
content — without it the box grows past the frame and the frame's
`overflow-hidden` slices whatever hangs out. And the table's own wrapper
is `shrink-0`, because a flex child shrinks by default and that wrapper
clips (it has to, for the rounded border) — so shrinking shows up as the
last row cut in half rather than a scrollbar.

Cell logic that can be wrong lives in exported functions rather than JSX:
`outcomeOf` reads the scoresheet from your seat ("1-0" is a win for one
side and a loss for the other), `opponentOf` picks the other name,
`formatClock` writes "3 min + 2". Tested directly, no rendering involved.

## Text: every string is a message

No literal text in JSX. Strings are declared as Lingui messages with the
`msg` macro, in the file that uses them:

```tsx
const MISTAKES_COPY = {
  title: msg`Mistakes`,
  empty: msg`Once your games are checked, your mistakes land here.`,
} as const;

const { i18n } = useLingui();
<PageHeader title={i18n._(MISTAKES_COPY.title)} />;
```

Why descriptors rather than `<Trans>` everywhere: the constants stay
centralised and typed, and extraction still works. `aria-label`, `title`
and `placeholder` count as text.

Counts and dates go through `Intl` (`Intl.NumberFormat`,
`Intl.DateTimeFormat`) — never hand-formatted, because separators and word
order differ by locale.

Catalogues live in `src/locales/{locale}/messages.po`; `pnpm --filter
@velachess/web i18n:extract` refreshes them. English ships in the bundle
and is active before the first paint — `I18nProvider` renders `null` until
a locale is activated. The others are fetched only when someone switches.

One case needed care: zod bakes its error text into the schema, so a
schema can't be declared before a locale exists. Sources expose
`buildSchema(translate)` and the form builds it per render.

## Styling

Tokens live in `libs/ui`; the app inherits them and declares none.
No `dark:` in a screen — if a component needs it, a token is missing.
No arbitrary values (`bg-[#111]`), no class built by concatenation
(`bg-move-${category}` doesn't exist in the generated CSS; Tailwind reads
source as text). Compose with `cn()`; use `cva` when a component has more
than two appearances.

## Tests

`pnpm test` runs one Vitest project per app and library (the root
`vitest.config.ts` discovers them via `apps/*/vitest.config.ts` and
`libs/*/vitest.config.ts`). `web` is its own project, not layered on a
shared backend config, because the app compiles Lingui macros and its
tests need the app's transform — `apps/web/vitest.config.ts` hands the
Lingui config path over explicitly, since vitest runs from the repo root
and Lingui resolves its config from the working directory without
searching upward.

Tests sit next to the code they cover, and come in two kinds.

**Pure ones** aim at the parts where being wrong is silent: route
matching (`/` is a prefix of everything), locale negotiation, catalogue
integrity (every destination has a route; every import source has a
schema and an icon), and validation rules.

**Screen ones** render. Testing Library mounts the route tree from
`src/test/routes.tsx` in a memory router and MSW answers the network from
an in-memory archive, so the app's own `hc` client and its own React
Query cache are the ones under test — nothing is swapped for a testable
double. Which is also why `api/client.ts` resolves its base URL against
the document instead of leaving it relative: `hc` builds a `URL` per
call, and a relative one has no origin to resolve against in Node.

The rule that keeps these honest is that a screen test may only assert on
what a person could read — an accessible name, a label, rendered text —
and never on the request it made. Asserting "the handler was called with
`?outcome=win`" is an assertion about how the screen is written; the fake
archive filters for real, so asserting on the rows that came back is an
assertion about what it does. The procedure is in
`docs/how-to/write-a-test.md`.
