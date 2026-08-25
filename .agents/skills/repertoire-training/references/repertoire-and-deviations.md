# Repertoire and deviation semantics

Candidate repertoires are evidence derived from a user's owned games, separated
by player color. Manual/confirmed preparation is intent and extraction must not
silently overwrite it. Chapters store ordered PGN/FEN roots; `libs/repertoire`
builds the pure tree and position indexes.

When a chapter applies, pure judgment produces one of four outcomes:

- `deviation`: the player left their own book; this may become training.
- `gap`: the opponent played a line the book does not cover.
- `book-ended`: the player's preparation ran out.
- `completed`: the game followed the book to its end.

The application persists `unmatched` when no chapter can judge the game—for
example, its root position differs or its PGN cannot be replayed. It is a
countable answer meaning “this repertoire does not cover this game,” not a
fifth pure `DeviationResult`.

Only a player deviation is blame/evidence about the player's move. Do not call a
gap a deviation or use analysis/review as synonyms for judgment.

Persisted judgment is per `(game, repertoire)`. A newly extracted or expanded repertoire
must be able to judge relevant history independently of another repertoire's
rows. Chapter changes may reopen outcomes whose missing coverage is now
meaningful; confirm the current reopening set in live code/tests rather than
assuming every old judgment is invalid.

The current pure meanings live in `libs/repertoire/judgment.ts` and related
tests; persistence is in application/db.
