# Notation and position semantics

- Preserve absent PGN metadata as unknown. A fixture proves a rating, clock,
  date, opening, or URL rule only when it carries that field.
- Convert SAN and UCI through a legal chessops position. Do not parse or convert
  context-dependent moves with string rules.
- Use `positionKeyOf` and `epdToFen` for stored repertoire and exercise
  positions. Do not introduce a second FEN/EPD key or concatenate counters.
- Verify the owning algorithm before changing ply indexing or position keys;
  database plies, analysis events, and human move numbers are not interchangeable.

`libs/infra/platforms/normalize.ts` is where provider/PGN input becomes a
normalized game. `libs/chess` owns notation and legality. Keep provider quirks
out of the chess library and chess rules out of transport code.

Detailed APIs and product contracts live in `docs/explanation/modules/chess.md`,
`docs/reference/repertoire.md`, and the corresponding code and tests.
