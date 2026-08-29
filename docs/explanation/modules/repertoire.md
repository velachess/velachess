# libs/repertoire

**Compares a played game against a prepared repertoire and reports exactly
where it left the prepared lines — no engine involved.** This is tree
comparison, not move evaluation: "did the player follow what they prepared,"
not "was the move good." Judging move quality is a different axis entirely
(would live in an analysis library, with evaluations supplied by the
`libs/infra/engine` workspace imported as `@velachess/engine`) and does not
touch `libs/repertoire` at all.

Exact parameters, judgment types and persisted shapes live in
`docs/reference/repertoire.md`. This document is the reasoning.

## Repertoire as a tree, not a line

`replayMainline` in `@velachess/chess` walks one line — right for a played
game, since real games have no variations. A repertoire is the opposite
shape: from any position, the owner has committed to exactly one of their
own moves, but the opponent might reply several different ways the owner
has prepared for. That's precisely what a PGN with variations (RAV) already
parses into via chessops — `buildRepertoireTree` walks it with chessops'
`transform`, not a new tree structure. `RepertoireTree` is chessops' own
`Node`/`ChildNode` type, holding `{ move, san, positionKey, comments, nags,
startingComments }` per node. No VelaChess-specific tree class exists
because chessops already produces the right shape.

`transform`'s own contract — clone the walk context at every fork, share it
along a straight line — is what makes `buildRepertoireTree` able to track
both the position (to call `parseSan` correctly at each node) and the SAN
path taken to get there (for diagnostics), by mutating a
`{ pos, path, clone() }` context in place. Verified against chessops'
compiled source, not assumed from the type signature: a fork clones the
context for every child except the last, so mutating in place inside the
callback is safe.

Illegal SAN in a branch is reported in `illegalMoves` (path, SAN, and the
position it failed in), not silently dropped. `replayMainline` _does_
silently stop at the first illegal move — correct there, because an
imported game is data pulled from the wild and partial replay is still
useful. A repertoire is authored, not imported; a typo that silently drops
a prepared line is a bug users would never see coming.

## Position key, not move history

`positionKey` is `makeFen(setup, { epd: true })` — board, side to move,
castling rights, en-passant target, no halfmove/fullmove counters (see
EPD in `docs/reference/glossary.md`). Two nodes reached by different move
orders collapse to the same key.

That key only pays for itself through `PositionIndex`
(`buildPositionIndex`), which groups every tree node by `positionKey`.
`findDeviation`'s `candidatesFor` doesn't just check the current node's own
children — it unions the children of every node sharing the current
position's key. The same position exposes the same prepared continuations
no matter which historical path reached it, because EPD already encodes
everything (including castling/en-passant rights) that legal continuations
actually depend on.

The naive-looking alternative — "look up the position _after_ the actual
move, jump there if it matches some node" — doesn't work and isn't what's
implemented. A transposition is only detectable at the exact ply where the
current position already coincides with another tree node; by the time a
mismatch several plies later might theoretically resolve into a known
position, the walk has already stopped at the first mismatch (see below).
Reconciling the _current_ node against its position-key twins, before
matching children, is what actually catches the case where two branches
of the same repertoire are two move orders into one target position.

## deviation vs. gap vs. book-ended

`findDeviation` walks a played game (already run through `replayMainline`)
against the tree in lockstep, and stops at the first ply that doesn't
match a prepared continuation. Three distinct reasons that can happen, not
one:

- **`"deviation"`** — it was the repertoire owner's own move, and it
  doesn't match any prepared choice. `expectedMoves` lists every prepared
  choice at that node (deduped by SAN), not just one — a repertoire can
  legitimately prepare more than one answer at the same position.
- **`"gap"`** — it was the opponent's move, and it doesn't match any
  prepared reply. There's no single "expected" move to report; the whole
  point is the opponent went somewhere unprepared.
- **`"book-ended"`** — nothing is prepared here at all, anywhere in the
  tree (`candidatesFor` returned nothing), regardless of whose move it
  was. A game that follows the prepared line exactly and then simply
  continues past where preparation stops is not an error — conflating it
  with `"gap"` would flag "I ran out of prep" the same as "I got caught
  off guard," which are different signals for a user.

The walk stops at the first such event by design — once off the tracked
position, there's nothing left in the repertoire to compare the rest of
the game against. This is a recorded decision, not an accident: emitting
further events after the first exit would compare moves against
preparation the game already left, and re-entering the tree later via
transposition is a different feature with its own semantics — if it ever
becomes one, it changes this contract deliberately, not incidentally.

The fourth outcome — the game stayed inside the tree the whole way — is
`event: null` on `DeviationResult`, and has a name: `judgmentType(result)`
returns `"completed" | "deviation" | "gap" | "book-ended"`, so consumers
(persistence, aggregation) share one vocabulary instead of each re-deriving
the null case.

## Chapter dispatch

A stored repertoire has many chapters; `findDeviation` judges against one
tree. `judgeAgainstChapters(chapters, replay, color)` is the rule that
connects them: judge against every applicable chapter, return the best
judgment plus the winning chapter's index. "Best" is deterministic — a
`completed` result wins outright; otherwise deepest `inBookPlies`; ties
resolve to the lowest index (the caller's sort order).

A chapter only applies if its `rootPositionKey` — the EPD of its starting
position, now carried on `BuiltRepertoire` — matches the game's starting
position. Without that check, a chapter with a custom starting FEN judged
against a game from the standard position would report `book-ended` at
ply 1: structurally false, since the game was never inside that chapter's
universe. Not applicable is not a judgment; when no chapter applies the
function returns null.

Merging all chapters into one tree with a shared position index (so
transpositions _across_ chapters reconcile) is the known upgrade path —
deliberately not built until a real repertoire hits that case.

## Adherence metrics

`adherenceMetrics(rows)` aggregates judgments into the two questions that
matter: _do I follow my preparation_ (`adherenceRate`) and _does it help
me_ (win rates inside vs. outside book). Faithfulness is about the owner's
own choices — only `"deviation"` counts as unfaithful; `"gap"` (opponent
left book), `"book-ended"` (preparation ran out), and `"completed"` are
all faithful. Games shorter than `minJudgedPlies` (default 6) are skipped
entirely — a 4-ply game says nothing about preparation, and counting it
would turn the statistic into noise. The function is pure; the db side
(`getJudgmentRows`) does the join with each game's result and perspective
and translates them into the owner's win/draw/loss.

## BuiltRepertoire

`buildRepertoire(game)` returns `{ tree, index, rootPositionKey,
illegalMoves }` in one call. `findDeviation` takes that bundle, not a separate `tree` and `index`
— the index is always derived from the tree, so accepting them as two
independent parameters would let a caller pass a tree and an index that
don't actually match. `buildRepertoireTree` and `buildPositionIndex` are
still exported individually for callers that need the tree without paying
for an index (or vice versa).

## Layout

```
tree.ts             RepertoireNodeData, RepertoireTree, buildRepertoireTree, IllegalRepertoireMove
position-index.ts   PositionIndex, buildPositionIndex
repertoire.ts       BuiltRepertoire, buildRepertoire
deviation.ts        DeviationEvent, DeviationResult, findDeviation
judgment.ts         JudgmentType, judgmentType — names the four outcomes
dispatch.ts         ChapterJudgment, judgeAgainstChapters — chapter selection rule
adherence.ts        JudgmentRow, AdherenceMetrics, adherenceMetrics
findings.ts         AdherenceFinding, adherenceFinding — the insight rule
decision-positions.ts  DecisionPosition, decisionPositionsOf — the trainable unit
chapter-view.ts     chapter tree shaped for the screen
extract.ts          extractRepertoireLines, openingNameFrom — the descriptive book
index.ts            public surface — re-exports all of the above
```

## Extraction (cycle 6)

`extract.ts` derives the descriptive book: instead of asking what you
intend to play, mine what you DO play.
A frequency trie over game mainlines, cut where support drops below
`minGames` (default 2) or `maxPlies` (default 12); every supported branch
becomes its own line, ordered by support. Chapter names come from the
dominant opening among supporting games via `openingNameFrom` — chess.com
hides the name in the ECOUrl slug (no `[Opening]` header), Lichess sends
it directly; fallback "Line N". Pure: games in, lines out — persistence
lives in application. Honest limits: the per-game name is the opening the
game REACHED (post-transposition) and a line is a prefix, so naming is a
dominant approximation, not exact position classification. One structural
consequence worth knowing: a game that later deviates from the derived book
still contributed its prefix to the trie — the book is the majority habit,
and minority lines the owner keeps playing will keep judging as deviations.
