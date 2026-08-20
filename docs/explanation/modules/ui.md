# libs/ui — the design system

Everything visual the app is made of: the theme, the primitives, the
frame, the icons, and the chess board. One rule holds the package
together — **nothing in here knows what the product is about**. Grep it
for `game`, `board`, `repertoire` or `mistake` outside `chess/` and it
comes back empty; it imports no router, so it works in any app.

## Where components come from

shadcn's registry, style `base-nova`, installed _into_ this package. The
CLI is run from `apps/web` and the monorepo contract in both
`components.json` files routes the files here — so third-party component
code is ours: versioned, editable, and re-exported through `exports`.

The Trophy registry is declared too, so gamification components would land
here as well. None are installed: there is no screen for them yet.

Nothing else is a UI dependency. `AppFrame` and friends are our files
arranging registry parts, so changing the frame changes an arrangement,
not a dependency.

## Layout: frame first

Regions are named and budgeted before any content exists. A screen fills a
region instead of inventing its own page shape — the alternative produces
"a padded scroll column that reads as a prototype".

| Component                            | Contract                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `AppFrame`                           | `nav` slot, `banner?`, children = main. Owns skip-to-content and the responsive contract |
| `NavDock`                            | the 64px icon rail; takes items as data and an `activeId`, and never routes              |
| `Stage` / `StageMain` / `StageAside` | master-detail; the aside carries an explicit width budget so the main region can't jump  |
| `PageHeader`                         | title, description, actions slot                                                         |

**Structure arrives through slots, content through children.** That split
is what makes the frame reusable: a route swaps the middle without knowing
a dock exists.

`NavDock` is generic over the caller's item type, so ids keep their union
all the way into `renderItem` instead of widening to `string` and forcing
a cast at the call site.

The responsive contract is written at the top of the component that
implements it, not spread through media queries.

## Cards are widgets, rows are data

A `Card` is a self-contained widget: a KPI tile, a chart panel, a settings
group. It is **not** a wrapper around a record. Anything the user scans,
filters or selects belongs in rows — edge-to-edge, 32–40px, with dividers.
Wrapping every record in a card is the fastest way to make an app look
generic.

## Theme

`src/styles/globals.css` is the only place tokens exist in the repo.
shadcn `base-nova` (utilities from `shadcn/tailwind.css`, `neutral` base
colour) plus our domain tokens: board squares and the four move-quality
colours, named after `engine_category` in the database and after
`MoveClassification` as the market names it.

Dark mode is already paved: `:root` and `.dark` carry the same tokens and
the `dark` variant is declared. All that's missing is something writing
the class on `<html>`.

The `@source` lines are load-bearing, not decoration: Tailwind skips
`node_modules`, and this package reaches the app through a workspace
symlink — without them, classes used here would never be generated.

### The palette

Two indigos, and which one to reach for is the whole rule:

| Token       | Value     | For                                                                        |
| ----------- | --------- | -------------------------------------------------------------------------- |
| `--brand`   | `#5B6CFF` | what you look at — the lockup tile, focus rings, `chart-1`, board overlays |
| `--primary` | `#4453D6` | what you click — filled controls, primary button                           |

Vela Indigo `#5B6CFF` replaced Electric Blue `#4F7CFF` across the theme,
the Brand Guide (v3) and the logo kit at once, so the system cannot
diverge from itself. The deeper `#4453D6` exists because a filled control
has to carry a label: Moon White on the brand indigo is 3.86:1 and misses
AA, on `#4453D6` it is 5.62:1. The accent belongs to the interface — the
mark is never tinted with either.

Board overlays follow one rule — indigo for _where_ (selection, last
move, primary arrows), Ice Cyan `--info` for information, `--board-check`
for check. `--board-check` is the same ink as `--destructive` on purpose:
two reds a shade apart read as two different alarms. Nothing renders it
yet; the token exists so the rule does.

### Contrast

Measured (WCAG 2.1, sRGB), against the shipping dark palette:

| Pair                                          | Ratio   |
| --------------------------------------------- | ------- |
| Moon White `#F4F6FA` on `--primary` `#4453D6` | 5.62:1  |
| `--brand` `#5B6CFF` on canvas `#0B0D12`       | 4.66:1  |
| `--brand` on card `#12151C`                   | 4.38:1  |
| `--primary` fill against canvas               | 3.20:1  |
| Ice Cyan `#8EEBFF` on canvas                  | 14.32:1 |
| Check red `#F0616F` on canvas                 | 6.15:1  |

Button labels clear AA, the brand indigo clears AA on both surfaces as
text, and the filled control clears the 3:1 floor for a UI component
against its background. Same `#4453D6` is the interaction token when a
light theme lands: brand indigo on white is 4.17:1, `#4453D6` is 6.08:1.

## Icons

`src/icons` is the only door: Lucide re-exported for interface icons, plus
the chess.com and Lichess marks. Apps import from here, so swapping the
icon set is one file rather than every screen.

The marks come from theSVG (MIT), which publishes each one with its own
licence — both are CC0-1.0, from the platforms' own brand pages. They take
`currentColor`, so a mark inside a tab follows the theme.

Names stay neutral. Which picture means "mistakes" is the app's call.

## The board

`src/chess/board.tsx` is the one file that knows react-chessboard's v5
API, where everything arrives through a single `options` prop. It exposes
our own shape — `fen`, `orientation`, `onMove`, `highlights` — and applies
the theme's board tokens instead of the library's defaults.

No chess rules live here: the board reports a drop and the caller, which
owns the position, decides whether the move was legal. Its test pins that
translation, because it's what breaks silently on an upstream update.

## React is a peer

`react` and `react-dom` are peer dependencies, not dependencies. A library
that depends on React directly can end up with a second copy — and two
Reacts show up as `Cannot read properties of null (reading 'useContext')`,
which is a confusing way to learn about your dependency graph.
