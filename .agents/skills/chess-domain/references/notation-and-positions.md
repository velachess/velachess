# Notation and position semantics

- PGN is a game record with optional headers and movetext. Headers such as
  ratings, clock, date, opening, and external URL may be absent; absence remains
  `null`/unknown rather than zero or an invented label.
- FEN describes a position and game-state fields. EPD is used where a playable
  training position needs normalized move counters. Use the existing conversion
  in `libs/chess` rather than string concatenation.
- SAN is context-dependent human chess notation; UCI identifies coordinate
  moves. Convert with a legal board state through chessops, not regex.
- A ply is the position plus the half-move played from it. Its mover follows
  turn parity; do not call it a full move or treat a ply index as a move number.
- Position identity must include every rule-relevant FEN field used by the
  owning algorithm. Repertoire position indexing intentionally follows the
  implementation in `libs/repertoire`; verify it before introducing another
  key.

`libs/infra/platforms/normalize.ts` is where provider/PGN input becomes a
normalized game. `libs/chess` owns notation and legality. Keep provider quirks
out of the chess library and chess rules out of transport code.
