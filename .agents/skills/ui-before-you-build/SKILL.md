---
name: ui-before-you-build
description: Read before writing any UI in VelaChess — a component, a loading state, an empty state, a badge, a panel. Says where components live in this monorepo, what to check before hand-rolling one, and the four rules that hold regardless of what the registry offers. Use alongside the `shadcn` skill, which covers the CLI and the registry itself.
---

# Before you build UI

The `shadcn` skill knows shadcn. This one knows **this repo**, and exists
because the registry being available is not the same as anyone checking it.

## The failure this prevents

Real, from this codebase's history:

| Hand-rolled                                | What the registry already had |
| ------------------------------------------ | ----------------------------- |
| A bordered card with content and an action | `Item`                        |
| A dashed empty state                       | `Empty`                       |
| A pulsing grey rectangle                   | `Skeleton`                    |
| A spinning loader                          | `Spinner`                     |

All four shipped, were found in review, and were replaced. Nobody decided
to reinvent them — the registry simply was not consulted. So:

**Before writing a component, search the registry. Say what you searched
for and what you found.** If nothing fits, say that too, and say why.

```bash
pnpm dlx shadcn@latest search <what you need>
pnpm dlx shadcn@latest view @base-nova/<name>
```

## Where things live

This is a pnpm workspace, not a single app. `components.json` sits in
`libs/ui`, not at the root.

```
libs/ui/src/components/   registry components — add here, never in apps/web
libs/ui/src/layout/       our own frame, dock, stage
libs/ui/src/charts/       our own
libs/ui/src/chess/        our own — the board
libs/ui/src/styles/       the only place tokens exist
apps/web/src/**               screens, which compose the above
```

`apps/web` never declares a component of its own that could be a
primitive, and never declares a colour. A screen that needs a new token
is a change to `globals.css`, not a hex in a className.

Adding one:

```bash
cd libs/ui && pnpm dlx shadcn@latest add @base-nova/<name>
```

Then export it the way its neighbours are exported and import it as
`@velachess/ui/components/<name>`.

## When the registry is right and you still write it yourself

Sometimes the answer is genuinely ours. Two live examples, and what
justified each:

**`Sparkline`.** Chart libraries hard-code `preserveAspectRatio="meet"`
and reserve an internal label gutter, so a chart dropped into a panel
renders centred, letterboxed and inset. `@microcharts/react` was
installed, tried, and removed for exactly that. Thirty lines of SVG buys
exact control, and the API is the shape a library would offer so swapping
one in later costs one file.

**`Spinner`.** Taken from the registry, with one change: its source picks
a glyph through an icon-placeholder that only exists inside shadcn's own
app. Ours comes from the icons module. The deviation is commented in the
file.

The pattern: **write it yourself only after trying the thing that exists,
and record what went wrong.** "It didn't feel right" is not a reason;
"the library letterboxes and here is the round I spent on it" is.

## Four rules the registry cannot enforce

**1. `aria-label` is copy.** It is read aloud, so it goes through Lingui
like any other string. Landmark names too.

```tsx
const COPY = { region: msg`Board` } as const;
<section aria-label={i18n._(COPY.region)}>
```

A component in `libs/ui` cannot translate — it takes the words from
its caller, the way `AppFrame` takes `skipLabel` and `NavDock` takes
`label`.

**2. Tokens, never hex.** `--move-ok`, `--move-inaccuracy`,
`--move-mistake`, `--move-blunder` exist for grades; `destructive` is a
destructive _action_, not a bad chess move. If a token is missing, add it
to `globals.css`.

**3. A skeleton is for "no data yet", not "more data coming".** Once
meaningful content is on screen it must not be replaced by a placeholder
because a stream is still arriving. Progress goes beside the content, not
instead of it.

**4. Derive during render.** `useState` mirroring server state, and
`useEffect` syncing it, are both wrong here. No `useMemo` or
`useCallback` without a measured reason.

## What to say before you write

```
NEEDED       the thing, in one line
SEARCHED     `shadcn search <terms>` → what came back
DECISION     use <component> | compose <a> + <b> | write it, because …
TOKENS       which existing ones; or the one being added and why
COPY         any user-visible string, and that it goes through Lingui
```

Three lines of honesty beats a component nobody knew already existed.

## Related

- `shadcn` skill — the CLI, the registry, theming, MCP
- `libs/ui/src/styles/globals.css` — every token
- `__tests__/architecture.test.ts` — the rules that fail the build
