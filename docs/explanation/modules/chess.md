# libs/chess

**[CHESS] RULES — who validates lance/legalidade.** Position representation,
move legality, move generation, FEN, SAN, PGN. Not the engine
(evaluation/search).

## chessops

Built on [chessops](https://github.com/niklasf/chessops), a TypeScript
library implementing chess rules: legal position representation, move
generation and validation, FEN, SAN. It's what actually answers "is this
move legal" and "what are all the legal moves here" — this package doesn't
reimplement any of that, it exposes chessops as VelaChess's typed entry
point to it.

Two concrete things this package leans on chessops for:

- **`Result<T, E>` instead of exceptions.** `parseFen`, `Chess.fromSetup`,
  and everything built on them return a `Result` — a caller has to check
  `.isOk`/`.isErr` (or call `.unwrap()` and accept the throw), the failure
  case is in the type, not something you find out by forgetting a
  `try/catch`.
- **`SquareSet`** — legal destinations come back as a bitboard-backed set
  (`Position.dests()`, `Position.allDests()`), not a list you build and
  filter by hand.

The package re-exports chessops directly — no VelaChess-specific types
wrapping chessops' own. Two functions aren't pure re-exports:

- `positionFromFen(fen)` — parses the FEN and validates the resulting
  position in one call, returning `Result<Chess, FenError | PositionError>`.
- `legalMoves(pos, square?)` — every legal move in the position (or from
  one square), with a separate entry per promotion choice. Destinations
  alone don't distinguish `a7-a8=Q` from `a7-a8=N`; this does.

## PGN

Also built on chessops, via its `pgn` module. Parsing produces a `Game` —
headers plus a tree of nodes (`mainline()` for the main line, branches for
variations), not a flat move list, since a real PGN can have both. The
parser is streaming and budget-limited, so a malformed or hostile PGN
can't hang or blow up memory. Comment annotations
(`[%clk]`, `[%eval]`, `[%csl]`/`[%cal]`) are parsed into structured fields
by `parseComment` rather than left as opaque text.

Parsing only checks that moves are syntactically valid SAN, not that
they're legal in the position they're played in — chessops is explicit
about this gap. `replayMainline(game)` is this package's one addition: it
walks a game's main line, plays each move through the same legality checks
as the rest of this package, and stops at the first illegal move instead
of throwing. A PGN pulled from the wild is data, not something to assume
is correct.

## Layout

```
vocabulary.ts   Square, Color, Role, Piece, parseSquare/makeSquare/opposite
fen.ts          parseFen, makeFen, Setup
position.ts     Chess, positionFromFen
moves.ts        Move, isDrop/isNormal, legalMoves
notation.ts     parseSan, makeSan, makeSanVariation
pgn.ts          parsePgn, Game, replayMainline
index.ts        public surface — re-exports all of the above
```
