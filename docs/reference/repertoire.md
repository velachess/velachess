# Repertoire

Facts about repertoire extraction, judging, and the persisted judgment model.
Reasoning: [`explanation/modules/repertoire.md`](../explanation/modules/repertoire.md).

## Extraction

`extractRepertoireLines(games, opts)` (`libs/repertoire/extract.ts`), called by
`extractRepertoire` (`libs/application/repertoires/extract-repertoire/`):

- Frequency trie over game mainlines, per color. Parameters in effect:
  `minGames = 2`, `maxPlies = 12` (defaults; no caller overrides them).
- A path stays in book while ≥ `minGames` games share it; each maximal
  supported path becomes one chapter — a straight line (`sansToPgn`), no
  variations, `starting_fen` null.
- Chapter name: dominant opening among games through the line's deepest node
  (`openingNameFrom`; ties broken alphabetically), fallback `Line N`.
- Membership is frequency only: no ratio test, no recency weighting, and game
  results are never read.
- Book names are fixed per color: `"White repertoire"` / `"Black repertoire"`
  (`REPERTOIRE_NAME`); a renamed candidate is renamed back on refresh.

Candidate vs manual: `repertoires.source` is `'extracted'` (candidate) or
`'manual'` (confirmed). Extraction refuses to touch a manual book
(`refused-confirmed`). A refresh replaces the whole candidate book
(`replaceChapters`) and deletes **all** of its judgments (`clearJudgments`)
first; decision positions are re-seeded afterwards (`seedRepertoireLines`).
Auto path (`ensureCandidateRepertoires`, inside sync): skips a color with
manual prep; refreshes an existing candidate only when the sync brought new
games.

## Judging

`judgeGamesForUser` (`libs/application/games/judge-games/judge-games.ts`):

- One judging repertoire per color: manual (confirmed) first, then oldest.
- Judgment per game: `judgeAgainstChapters` picks among chapters whose
  `rootPositionKey` matches the game's start; `completed` wins outright, else
  deepest `inBookPlies`, ties to lowest chapter index.
- `findDeviation` walks the played game against the chapter tree and stops at
  the **first** unmatched ply. Candidate continuations at each step are the
  union across all tree nodes sharing the current EPD position key
  (transpositions within one chapter reconcile; across chapters they do not).
- Outcomes (`deviation_type` enum): `deviation` (own move unprepared, carries
  `expected_sans`), `gap` (opponent unprepared), `book-ended` (nothing
  prepared here at all), `completed` (whole game in book), `unmatched` (no
  chapter could judge the game — persisted, not skipped).
- The walk never re-enters the tree after the first mismatch.

## Persisted judgment (`deviations` table)

One row per `(game_id, repertoire_id)` — unique index
`deviations_game_repertoire`; re-judging upserts. Fields: `type`,
`in_book_plies`, `game_plies`, `ply`, `position_key` (EPD), `played_san`,
`expected_sans` jsonb (only for `deviation`), `cp_loss`, `engine_category`
(filled by analysis, see [`analysis.md`](analysis.md)), `drillable`,
name snapshots (survive repertoire deletion — FK columns are `set null`).

Reopening rules:

- Adding a chapter deletes that repertoire's `gap` / `book-ended` /
  `unmatched` rows so the bigger book re-judges them; `deviation` and
  `completed` rows stay (`reopenNonPlayerJudgments`).
- A candidate refresh deletes all of its judgments (`clearJudgments`).
  `exercise_sources.deviation_id` cascades on delete; exercises and cards
  survive through their `(user, position)` identity.

## Adherence and findings

- `adherenceMetrics(rows, {minJudgedPlies = 6})` (`libs/repertoire/adherence.ts`):
  games with `gamePlies < 6` are skipped (the floor reads total game length,
  not `inBookPlies`). Faithful = `type !== "deviation"`; `gap`, `book-ended`
  and `completed` all count as faithful. Win rate = wins / decided games.
- `getJudgmentRows` excludes `unmatched` rows and rows with null `gamePlies`.
- `adherenceFinding` (`libs/repertoire/findings.ts`) reports a
  book-advantage/disadvantage insight only with ≥ 5 decided games in each
  bucket and a win-rate gap ≥ 0.10.

## Decision positions

`decisionPositionsOf(built, color)` (`libs/repertoire/decision-positions.ts`):
every position where it is the owner's turn and the tree prepares ≥ 1
response, including the chapter's starting position. Transpositions collapse
to one decision with the union of prepared responses. Feeds the
`repertoire-line` drill origin (see [`drills.md`](drills.md)).

## Position identity

`positionKeyOf(fen)` (`libs/chess/fen.ts`) = EPD
(`makeFen(setup, {epd: true})` — no halfmove clock / move number). The same
key is used by the deviation walk, decision positions, and exercise identity.
`epdToFen` restores a playable FEN with zeroed counters.
