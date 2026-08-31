# Opening data

Facts about how opening information is stored and derived. There is **no
opening database** in the repository — no ECO table, no polyglot file, no
master-games tree. "Book" in product language means the player's own
repertoire (see [`repertoire.md`](repertoire.md)).

## Stored columns

Written once at import by `normalizeGame`
(`libs/infra/platforms/normalize.ts`), straight from PGN headers, never
recomputed:

| Column               | Source header | chess.com                     | Lichess                    |
| -------------------- | ------------- | ----------------------------- | -------------------------- |
| `games.opening_eco`  | `ECO`         | sent                          | sent                       |
| `games.opening_name` | `Opening`     | never sent (always null)      | sent ("Family: Variation") |
| `games.opening_url`  | `ECOUrl`      | sent (name lives in the slug) | not sent                   |

No validation or lookup happens on any of the three.

## Derivation functions

Two slug/name parsers exist, for different granularities:

- `openingFamily(name, ecoUrl)` (`libs/infra/platforms/opening-family.ts`) —
  the aggregation bucket. Lichess: substring before the first `:`. chess.com:
  slug words up to and including the first family marker
  (`defense | defence | opening | game | gambit | attack | system | variation`),
  stopping at the first token starting with a digit; shapes with no marker
  fall back to the first 3 words.
- `openingNameFrom({name, url})` (`libs/repertoires/extract-repertoire/extract.ts`) — the full
  human-readable name for extracted chapter titles: slug words until the
  first move-like token, no marker cut.

Example, same URL: chapter name "Closed Sicilian Defense Grand Prix Attack",
insight bucket "Closed Sicilian Defense".

## Consumers

| Consumer                      | What it reads                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Game report and games list UI | raw columns (`game.openingName`, `game.openingEco`); chess.com games render the unknown-opening copy because `opening_name` is null |
| Insights (`opening-weakness`) | `openingFamily(...)` derived at read time; floors: 5 decided games per opening, 20 baseline games, 0.10 win-rate delta              |
| Repertoire extraction         | `openingNameFrom(...)` for chapter names (dominant among supporting games, fallback `Line N`)                                       |

## Interaction with analysis

None. Move classification reads no opening or book data: every ply from move 1
is graded with the same thresholds (see [`analysis.md`](analysis.md)), and the
analysis report carries no book/theory marker.
