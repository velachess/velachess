---
name: chess-domain
description: Apply VelaChess chess semantics for PGN, FEN, EPD, SAN, UCI, legal moves, colors, turns, player perspective, results, and position identity. Use when parsing or representing chess data, deriving who played which side, interpreting a game result, replaying moves, or changing code whose correctness depends on chess rules.
---

# Apply chess-domain semantics

Do not infer a product fact from a chess notation field that does not encode it.
Trace the value from normalization through its consumer and test with a fixture
that carries the relevant evidence.

Use the references only for the concept touched:

- Read [references/player-perspective.md](references/player-perspective.md)
  when deciding who “you” are, the opponent, or win/loss/draw.
- Read [references/notation-and-positions.md](references/notation-and-positions.md)
  for PGN/FEN/EPD, SAN/UCI, ply, turn, and position identity.

Prefer `libs/chess` and chessops primitives over new parsers or move models.
Keep pure chess rules independent of accounts, providers, UI, database, and
engine policy. Provider normalization and storage belong to `game-ingestion`;
Stockfish scores and classifications belong to `engine-analysis`; repertoire
meaning belongs to `repertoire-training`.

Verify live schemas and library APIs before acting on a reference. Add a rule
here only when VelaChess has a non-obvious semantic decision or demonstrated
failure that code/tests alone do not make discoverable.
