# libs/chess

**[CHESS] RULES — what decides whether a move is legal.** Position
representation, move legality, FEN, SAN, PGN. Not the engine
(evaluation/search).

## chessops

Built on [chessops](https://github.com/niklasf/chessops), a TypeScript
library implementing chess rules: legal position representation, move
generation and validation, FEN, SAN. It's what actually answers "is this
move legal" and "what are all the legal moves here" — this package doesn't
reimplement any of that.

Two concrete things this package leans on chessops for:

- **`Result<T, E>` instead of exceptions.** `parseFen`, `Chess.fromSetup`,
  and everything built on them return a `Result` — a caller has to check
  `.isOk`/`.isErr` (or hand `unwrap` an error branch), the failure case is
  in the type, not something you find out by forgetting a `try/catch`.
- **`SquareSet`** — legal destinations come back as a bitboard-backed set
  (`Position.dests()`, `Position.allDests()`), not a list you build and
  filter by hand.

What chessops answers is re-exported unchanged, never wrapped, and
`index.ts` writes the public surface out name by name — so what the app may
reach for is that file rather than whatever a module happens to export.
What this package adds is what chessops does not answer:

- `positionFromFen(fen)` — parses the FEN and validates the resulting
  position in one call, returning `Result<Chess, FenError | PositionError>`.
  `parseFen` only checks the FEN is well-formed; `Chess.fromSetup`
  separately checks the position is legal.
- `legalDestinations(pos, square)` — where a piece may go, and whether it
  would capture there. `pos.dests` answers neither: it does not say whether
  a landing square is occupied (en passant captures a pawn that isn't on
  it), and it names castling on the rook's square.
- `playMove(pos, from, to, promotion?)` — validates and applies one move
  without mutating the position handed in, returning the FEN it produced and
  the move's SAN.
- `squaresOfSan` / `squaresOfUci` — the two squares a board draws between.
  Castling resolves to `kingCastlesTo`'s square, not chessops'
  king-takes-own-rook encoding, because that is what a board draws and what
  every engine's UCI says.

`Chess` is the only variant this app constructs, so a Chess960 game gets no
castling.

## PGN

Also built on chessops, via its `pgn` module. Parsing produces a `Game` —
headers plus a tree of nodes (`mainline()` for the main line, branches for
variations), not a flat move list, since a real PGN can have both. The
parser is streaming and budget-limited, so a malformed or hostile PGN
can't hang or blow up memory.

Parsing only checks that moves are syntactically valid SAN, not that
they're legal in the position they're played in — chessops is explicit
about this gap. `replayMainline(game)` is where it gets closed: it walks a
game's main line, plays each move through the rules, and stops at the first
illegal move instead of throwing. A PGN pulled from the wild is data, not
something to assume is correct.

It hands back plain, serializable data (`ReplayedGame`), not a live
`Position`: each half-move's ply, SAN, UCI, side, move number and the FEN
either side of it. That is the one interpretation of a game — the review
screen and the analysis pass both read it, so neither parses the movetext
again, and no mutable chessops `Position` escapes the module.

Whether a replayed game is worth keeping is a separate question, stated
once: `isPlayableGame(headers, replay)` for a game already parsed, and
`hasPlayableGame(text)` for raw text at a trust boundary. A game that goes
illegal part-way is kept — the legal prefix is what gets shown and
analysed.

## Not chess rules

Three derivations live here that are product conventions rather than rules
of chess: `resolveGamePerspective` (which seat is yours),
`gameOutcomeFor` (whether `1-0` is a win) and `timeClassOf`
(bullet/blitz/rapid/classical from estimated duration). They are here
because the server and the browser must agree on them and this is the one
pure package every module may import — `libs/infra/db` may not import a
business module and already hops through `platforms`. Each states its rule
in its own file, and the SQL predicates that express the same rules are
held to these functions by route and database tests, not by shared code.

## Layout

```
position.ts     positionFromFen, Position
moves.ts        legalDestinations, playMove, squaresOfSan/squaresOfUci, uciOf
pgn.ts          replayMainline, ReplayedGame, isPlayableGame, hasPlayableGame
perspective.ts  resolveGamePerspective
game-result.ts  gameOutcomeFor, GameResult, GameOutcome
time-class.ts   timeClassOf, TIME_CLASSES, TIME_CLASS_CEILINGS, ESTIMATED_MOVES
index.ts        the public surface, listed name by name
```
