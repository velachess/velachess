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
  api/          the typed door to the backend (transport, not a domain)
  app-shell/    frame assembly: navigation as data, the layout routes use
  i18n/         locale resolution and catalogue activation
  dashboard/    the overview
  games/        everything you do to games
    import/       connect an account and pull games in
  mistakes/     where you left your repertoire, and what it cost
  repertoire/   the lines you actually play
  drill/        spaced repetition over your worst mistakes
  routes/       routing only — a route imports a slice and mounts it
```

Importing and reviewing are things you do _to games_, so they nest under
`games/` rather than sitting beside it — the URL says what the thing
belongs to, not merely that it exists.

A slice owns its data (`queries.ts`), its screen, its constants and its
tests. It never positions itself on the page — it returns content, and the
shell decides where that content goes.

## Two vocabularies, one boundary

Data keeps the domain's name; screens are named after the user's job.

| The API says   | The person sees | Why                                                                                 |
| -------------- | --------------- | ----------------------------------------------------------------------------------- |
| `deviation`    | Mistakes        | Nobody opens an app to see deviations. `deviation` is _how_ we detect it.           |
| `review` (SRS) | Drill           | In chess products "Game Review" means analyzing a game — the collision is real.     |
| `repertoire`   | Repertoire      | Same word on both sides, and that's fine: it's a word players use, not a mechanism. |

The rule is not "always differ" — it is "don't ship the mechanism's word
to the user". The mapping happens once, at the edge, inside the slice.

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

`_app` is the product: every screen under it needs games to exist. The
check is a `beforeLoad` on that layout route which throws `redirect()` —
the pattern from TanStack Router's authenticated-routes guide. A layout
route's `beforeLoad` runs before any child's, and throwing stops the
children loading at all, so a private screen is never reachable by URL,
by preload, or by a stale link.

Guards run before components exist, so they read through the query cache:
the `queryClient` is on the router context and `beforeLoad` calls
`ensureQueryData` — the arrangement from the external-data-loading guide.

`/import` sits outside `_app`, as a page rather than an overlay, with the
inverse guard: someone who already has games is sent to the product. That
placement is what makes sign-in additive later — an `_auth` group joins it
at the public level, and `_app` gains a session check ahead of the data
one, session first, then data.

## Identity: three layers, two of them built

Who "you" are is three different facts, and the app keeps them apart:

1. **The platform username** — public. `tracked_accounts` and `games` are
   keyed by `platform+username` with an upsert; two browsers importing the
   same username share the same server rows. Nobody owns `yurimutti` —
   chess.com's archive is public data.
2. **The device** — the anonymous "me". Which accounts are _mine_ lives in
   a persisted store (`games/import/my-accounts.ts`), written on import,
   the way a session cookie would be. Clearing site data means starting
   over, exactly like signing out; re-importing is cheap because the
   upsert lands back on the already-synced account.
3. **The user** — not built yet. Sign-in replaces the api's
   single-user middleware (services already take `userId` explicitly, so
   that swap is one function), the first signed-in session claims the
   device's remembered accounts (`linkAccountToUser` exists), and the
   store keeps its interface while its backing moves from localStorage to
   the server. `_app` gains a session check ahead of the data one.

Chesslume is the reference for this shape: there, the username travels in
the URL, the games endpoint ignores identity entirely, and login is
orthogonal to viewing. We keep import as an explicit act because ours
triggers real compute (engine analysis, judging) — but ownership is
device-side all the same.

`importStatus` answers `ready` or `empty` from the device store alone —
no arguments from the network, no `await`. That is a consequence of
importing being one synchronous read: an account is remembered only after
a response that already carried games, so there is no delivery state left
to verify and no reason to reach the network to decide where someone
belongs.

It matters that the guard can't fail. A guard runs before any component
exists, so a rejected query there has nothing to catch it and blanks the
whole app. This one never leaves the browser; a test pins that by making
`fetch` throw.

The earlier design asked the server on every navigation — `GET /accounts`
carried `syncState` so the client could tell "still syncing" from "gave
up". That machinery existed because importing was a queued job, and it
went away with the job.

`/import` has no inverse guard: importing is idempotent, so the page stays
reachable and is where a second account gets added. Bouncing people out of
it turned an empty product into a dead end. On success the screen
navigates to `/games` — `beforeLoad` only re-runs on navigation, and
importing _is_ the listing.

## Tables

`DataTable` in `@velachess/ui` is the reusable half only — TanStack Table
stays headless and the component renders what it hands back. Columns,
filters and copy belong to the screen, which is why `games/list` owns its
`columns.tsx` and the package owns none of it.

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

`pnpm test` runs one vitest project per app and package (the root
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
