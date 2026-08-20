# libs/fixtures

**Named FEN/PGN test data, shared across packages.** Without it, every
package that needs a real position or game to test against — a checkmate,
a stalemate, a promotion, an en passant capture — ends up hardcoding the
same kind of string inline, duplicated and redefined slightly differently
in each package's own test files.

Pure data, no dependency on chessops or any other rules library. That's
deliberate: `libs/chess` isn't the only future consumer — `engine`,
`game-sources`, and `drilling` will all need chess positions to test
against, and none of them should have to inherit a rules-library dependency
just to import a FEN string.

## A fixture is only evidence of what it contains

The `looper` games are bare — names, result, movetext — because judging
needs nothing else. The games list then shipped broken while the suite
stayed green: every column it renders reads a tag those PGNs never had, so
no test could tell "the pipeline drops the field" from "the field was
never there". Every game read `Unfinished`, and nothing failed.

When a screen starts reading a new field, the fixture has to carry it.
`listing.ts` is the answer for the list: tagged the way chess.com tags a
real game — ratings, `TimeControl`, `UTCDate`, `ECOUrl` — and playing one
game from each seat, because a fixture where you are always white proves
nothing about the rule that decides which side was you.

## Layout

```
positions.ts   named FEN constants — STARTING_POSITION, FOOLS_MATE_CHECKMATE,
               STALEMATE_KING_IN_CORNER, PAWN_PROMOTION_AVAILABLE,
               EN_PASSANT_AVAILABLE, CASTLING_AVAILABLE
games.ts       named PGN constants — FOOLS_MATE_PGN
chess-com.ts   real chess.com Published-Data API response shapes
lichess.ts     real Lichess API response shapes
looper.ts      the canonical full-loop scenario — one archive, two games
               (one deviating from a white repertoire, one in book), shared
               by the application/api/worker suites
index.ts       public surface — re-exports all
```

The fake fetches that _serve_ these payloads live in
`libs/test-utils` — data here, behavior there.

Each constant's name says what it's for; a one-line comment above it says
which exact position/game it is.
