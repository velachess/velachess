# Opening data

Facts about how opening information is stored and derived. There is **no
opening database** in the repository — no ECO table, no polyglot file, no
master-games tree.

## Stored columns

Written once at import by `normalizeGame`
(`libs/infra/platforms/normalize.ts`), straight from PGN headers, never
recomputed:

| Column               | Source header | chess.com                                | Lichess                    |
| -------------------- | ------------- | ---------------------------------------- | -------------------------- |
| `games.opening_eco`  | `ECO`         | sent                                     | sent                       |
| `games.opening_name` | `Opening`     | not sent; derived from the `ECOUrl` slug | sent ("Family: Variation") |
| `games.opening_url`  | `ECOUrl`      | sent (name lives in the slug)            | not sent                   |

The name is resolved by `openingNameFrom` (below); no validation or lookup
happens on any of the three.

## Derivation functions

- `openingNameFrom({name, url})` (`libs/infra/platforms/opening.ts`) — resolves
  the stored name: the `Opening` header when present, otherwise the chess.com
  `ECOUrl` slug words up to the first move-like token (starts with a digit or
  `...`). Example: a slug ending `Closed-Sicilian-Defense-Grand-Prix-Attack-3...g6`
  yields "Closed Sicilian Defense Grand Prix Attack".
- `openingFamily(name, ecoUrl)` (`libs/infra/platforms/opening-family.ts`) —
  the family level. Lichess: substring before the first `:`. chess.com: slug
  words up to and including the first family marker
  (`defense | defence | opening | game | gambit | attack | system | variation`),
  stopping at the first token starting with a digit; shapes with no marker
  fall back to the first 3 words. Exported helper with its own tests; no app
  or module calls it.

## Consumers

| Consumer                      | What it reads                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Game report and games list UI | raw columns (`game.openingName`, `game.openingEco`); games with a null `opening_name` render the unknown-opening copy |

## Interaction with analysis

None. Move classification reads no opening or book data: every ply from move 1
is graded with the same thresholds (see [`analysis.md`](analysis.md)), and the
analysis report carries no book/theory marker.
