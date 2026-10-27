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
  api/            the backend HTTP contract: client, errors, health, 401 handling
  app-shell/      frame assembly: navigation as data, the layout routes use
  auth/           session, sign-in, sign-out and user presentation
  backend-status/ backend-availability state and the banner that shows it
  chess-sounds/   move-sound preference, mapping and playback
  engine/         Stockfish sessions and the Workers they own
  i18n/           locale resolution and catalogue activation
  games/          everything you do to games, as four domains
    analysis/       produce evaluations and read them
      game/           grade a whole game, ply by ply
      position/       evaluate single ad-hoc FENs
    review/         walk a game, understand its analysis, try a variation
    import/         get games in
      accounts/       connect a provider account and keep it synced
      pgn/            paste or upload a PGN
    list/           filter and page owned games
    game-query-keys.ts  the prefixes the game caches hang off
    game-sources.ts     what each source is called and the mark that stands for it
  libs/           thin third-party facades only (zod, hono/client, React Query)
  onboarding/     first-run dialog while the library is empty
  query/          this app's React Query client: retry policy and error wiring
  settings/       account and product preferences
  routes/         routing only — a route imports a slice and mounts it
  router.tsx      router construction; route-error.tsx sits beside it
```

Importing, analysing and reviewing are things you do _to games_, so they
nest under `games/` rather than sitting beside it — the folder says what
the behavior belongs to, not merely that it exists.

Inside `games/` the four domains are the product's four capabilities, and
each one's `index.ts` is the only thing a route, a sibling vertical or the
test harness may import; dependency-cruiser enforces it
(`games-domain-index-only`). A sub-slice (`import/pgn/`,
`import/accounts/`) is internal to its domain: its own `index.ts` is a
contract toward the rest of that domain, not toward the app.

Those barrels are the one thing `react-doctor` and this repository
disagree about. Its `no-barrel-import` rule asks for the file rather than
the folder, which is a dependency-cruiser error here, and all twenty of
its hits are mandated `index.ts` imports — so the rule is off in
`doctor.config.json`. The boundary is worth more than the tree-shaking.

`engine/` sits outside `games/` for the same reason `api/` and `query/`
do: it is infrastructure, not a capability. It is the Stockfish factory,
its sessions and their Workers, and `games/analysis` is its only consumer
— through its `index.ts`, like any vertical. One rule
(`engine-is-infrastructure`) keeps it from reaching into `games/`, into
`@velachess/analysis`, the router or a state library: it runs searches and
returns the engine's own result, so what a score means and who is looking
at one stay outside it.

The one direction that matters is that **Review consumes Analysis and
Analysis knows nothing of Review** — analysis produces and interprets
evaluations, review decides what a person sees. A rule holds Analysis to
it (`games-analysis-depends-on-no-sibling-domain`), so a formatter or a
badge can never drift into the domain that runs the engine. Analysis
hands over `GradedPly[]`; Review reads it — `review/review-model.ts`
looks a ply up, `review/move-presentation.ts` and `review/board-view.ts`
turn what it finds into what reaches the screen (score text, badges,
arrows, which seat the board faces), and a count only one screen shows
stays in that screen.

Two files sit at the root, both for the same reason: more than one domain
needs the exact same fact, and the alternative is one domain importing
another for it. `game-query-keys.ts` holds the React Query prefixes —
`list` and `review` read those caches, `import` invalidates them when
games land, and an invalidation only works if the write spells the key
exactly as the read does. `game-sources.ts` holds each source's name and
mark — the table, the review header, the connect form's tabs and the
connections list all show them, and three separate maps had already
drifted into disagreeing about whether a PGN file gets a mark at all.
`import` builds its form metadata on top of that one, rather than
carrying a second copy of the name and icon.

A slice owns its data (`queries.ts`), its screen, its constants and its
tests. It never positions itself on the page — it returns content, and the
shell decides where that content goes.

There is no `shared/`: a grab-bag by definition groups by technical type,
which is exactly what this app's slices refuse to do. `api/`,
`backend-status/`, `chess-sounds/`, and `query/` are verticals like any
other — each named for what it does, not for being "shared" — and each
exposes only its `index.ts`; a deep import into one of these from anywhere
else is a dependency-cruiser violation, not a style preference. `libs/` is
the one exception on purpose: it holds thin re-export wrappers around
third-party packages (`zod`, `hono/client`, `@tanstack/react-query`) with no
business logic of their own, so every file in it is public and none needs
an `index.ts` — wrapping the package once means a version bump or a
provider swap touches one file instead of every consumer.

## Two vocabularies, one boundary

Data keeps the domain's name; screens are named after the user's job.

| The API says  | The person sees  | Why                                                                                 |
| ------------- | ---------------- | ----------------------------------------------------------------------------------- |
| `analysis`    | Review           | The person reviews a game; analysis is the mechanism that produces the review.      |
| `perspective` | You played white | The stored side is data; the screen says it from the person's own seat.             |
| `blunder`     | Blunder          | Same word on both sides, and that's fine: it's a word players use, not a mechanism. |

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
- **Zustand** — client-only state, in two shapes that differ by lifetime
  rather than by library. A module-level store (`create`) holds what
  outlives every screen: a preference someone chose (sound, locale, the
  selected import source, and — persisted — which accounts this device
  imported) or work this device is doing, where browser analysis keeps
  grading with nothing mounted. A store built per instance (`createStore`
  from `zustand/vanilla`) holds what belongs to one screen but to several
  components inside it: the review's ply, its variation and the
  evaluation that came back for it. Components reach a per-instance store
  through a domain facade — `games/review/use-game-review.ts` — rather
  than through zustand, so the library can be replaced without touching a
  screen.
- **`useState`** — what dies with the component (text being typed).

Derive instead of storing: the active nav item comes from the pathname.
Nothing to desync, and no
`useEffect` to keep them honest.

## The frame and the gate

`AppFrame` (in `@velachess/ui`) takes navigation through a slot and
content as children. Region budgets and the responsive contract live in
`libs/ui`, next to the components that implement them.

`_app` is the authenticated product. Its layout `beforeLoad` resolves the
Better Auth session through the query cache and redirects unauthenticated
visitors to `/login`, preserving the requested path. `/login` mirrors the
guard and sends an authenticated visitor back to the product.
`/forgot-password` and `/reset-password` sit beside it, public too; the
sign-in screen links to the first only when `GET /config` reports
`passwordReset`. `/login` loads `GET /config` before rendering and shows only
the methods it reports; with both the email link and passwords on, the link
leads and the password form is one click away.

Guards run before components exist, so session resolution returns a defined
authenticated/unauthenticated state instead of leaking a rejected query. The
login redirect search value accepts only an on-site path; `//host` and absolute
URLs are rejected so it cannot become an open redirect.

Onboarding is an overlay at the authenticated layout boundary, not a second
identity system: a dialog of two intro slides and the import form covers the
app while the library is empty. `/import` stays reachable inside the product so
a user can add another tracked account.

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

Syncs run in the background and the client never waits on one. `useSyncGames`
is a mutation that only asks: `POST /accounts/:id/sync` per account in
parallel, a `429` reported as the cooldown it is, and `accounts` invalidated
when the requests settle so the server's `syncStatus` / `activeSyncId` drive
the "Syncing…" state on every screen and after a reload. Landing is announced,
not polled: `games/import/accounts/sync-events.ts` keeps the session's one
`GET /syncs/events` stream (`event-source-plus`, opened by the `_app` layout
and closed with it) and, on `sync.completed` or `sync.failed`, invalidates
`games` and `accounts` — the payload is never read. The stream is a signal,
not a record, so every reconnection after the first repairs the gap with the
same invalidation; a failed attempt invalidates nothing, and a `401` ends the
session the usual way. No completion toast: the list refreshing is the
answer. Connecting invalidates `accounts` and the session; disconnecting,
`accounts`, `games` and `game`.

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
const GAMES_COPY = {
  title: msg`Games`,
  description: msg`Every game you've imported, and how it went.`,
} as const;

const { i18n } = useLingui();
<PageHeader title={i18n._(GAMES_COPY.title)} />;
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
