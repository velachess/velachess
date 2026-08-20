---
name: chess-data
description: Working with games, PGN tags, platform sources and chess semantics without presuming. Use before reading any game field, adding a column to a game screen, writing a fixture, or touching chess.com/Lichess ingestion. Most bugs in this repo were a confident assumption about chess data, not a coding mistake.
---

# Chess data: check, don't presume

A PGN is a scoresheet, not a record about you. A platform's archive is
public data with its own rules. Almost every wrong screen in this repo
came from treating one of those as if it already answered a question it
never asked.

## Before reading a game field, answer three things

1. **Who fills it, and when?** Trace back to `libs/infra/platforms/normalize.ts`.
   If it maps from a PGN header, the field is only as present as that tag.
2. **Is it stored or derived?** Some questions have no column and never
   will — see the list below.
3. **Does the fixture you'll test with actually carry it?** A fixture is
   only evidence of what it contains. `libs/fixtures/looper.ts` is
   bare on purpose (judging needs names, result, movetext);
   `listing.ts` is tagged like a real chess.com game.

## Questions a PGN cannot answer

- **"Which side was me?"** Nothing in a PGN says so — the normalizer sees
  players, not an identity. `games.perspective` holds only what a _paste_
  declared, so it is `null` on everything synced. The answer is derived
  by matching the tracked account's username against the two player
  names (`resolveGamePerspective`, and the same rule in SQL in
  `listGamesPage`). **Every consumer must use the same derivation** — a
  filter reading the stored column while the list reads the derived one
  returns nothing and looks fine.
- **"Did I win?"** `result` is the scoresheet: `1-0`, `0-1`, `1/2-1/2`,
  `*`. It is a win for one seat and a loss for the other, so it can only
  be read together with the perspective. `*` means unfinished, and so
  does a known result with an unknown seat.
- **"Is this my opponent?"** Falls out of the same derivation.

## Tags that are often absent

Never assume presence. Real chess.com games carry them; a hand-written
PGN, a Lichess export or an older game may not.

| Field                        | From                                          | Absent when                     |
| ---------------------------- | --------------------------------------------- | ------------------------------- |
| `WhiteElo` / `BlackElo`      | headers                                       | unrated, or a stripped export   |
| `TimeControl`                | header, `"600"` or `"180+2"`                  | correspondence, pasted PGN      |
| `UTCDate` + `UTCTime`        | headers                                       | pasted PGN → `playedAt` is null |
| `ECOUrl` / `Opening` / `ECO` | chess.com sets `ECOUrl`; others set `Opening` | short games, unknown lines      |
| `externalUrl`                | the provider, not the PGN                     | pasted PGN                      |

Rendering one of these means handling its absence — `—`, not a guess and
not a zero.

## Time control is a duration, not a clock

`3+2` plays like a much longer game than `3+0`, so both platforms bucket
by **estimated duration**: `initial + 40 × increment` (Lichess's
published formula; chess.com's classes line up closely enough that one
rule serves both). Boundaries live once, in
`libs/infra/platforms/time-class.ts`, and the SQL predicate is built from the
same constants — never re-typed.

Formatting is ours, not the platform's: "10 min", "3 min + 2". The two
platforms word it differently and the same game must read the same here.

## The four verdicts are not synonyms

From `libs/repertoire/judgment.ts`, and the distinction is the
product:

- `deviation` — **you** left your own book. The only one that is your
  fault, and the only one that becomes an exercise.
- `gap` — the opponent played something the book doesn't cover.
- `book-ended` — your preparation ran out.
- `completed` — the game followed the book to the end.

Collapsing `gap` into `deviation` would tell someone they erred when
their opponent did.

## Platform rules to respect

- **chess.com**: requests must be **sequential** — parallel requests are
  documented to trigger 429. Start from the real archives index rather
  than guessing a month, or a game that just crossed a month boundary
  disappears.
- **Both**: rate-limited. `POST /accounts/:id/sync` enforces a 60s
  cooldown per account and answers 429 with `Retry-After`.
- **Public archives, no auth.** Anyone can import anyone: a username is
  not proof of ownership. Nothing may treat it as identity.

## Licensing, before copying anything

Assets and data have licences, and this repo is GPL-3.0-or-later:

- **chess.com sounds and assets** — proprietary. Do not download. The
  licence of this repo changes nothing about that.
- **Lichess default sounds** — non-free. Its *free* sound sets are
  AGPLv3+, which GPLv3 §13 does permit combining with — but the AGPL's
  network-source obligation then rides on anything that includes them,
  which is a bigger decision than picking a sound. Ask first.
- Safe paths: CC0 assets, or synthesis.
- **Game data** from public archives is fine — that is what the APIs are
  for. Fixtures still use invented handles: a test has no business
  republishing a real person's games.

## Two deduplication rules, and they are not the same

`saveGames` uses `onConflictDoNothing`, so a blocked insert is silent —
it comes back as a lower `saved` count, never an error.

- **`(source, externalId)` is globally unique** where `externalId` is not
  null. One platform game is one row, no matter how many accounts import
  it. This is the one that surprises: reusing a fixture's chess.com URLs
  under a second account inserts nothing, and the test reads as a
  pipeline failure.
- **`(accountId, movetextHash)`** is unique per account, with
  `nullsNotDistinct` — so two pasted PGNs (both `accountId` null) with
  the same moves collide, while two tracked accounts may each keep their
  own copy.

Writing a second fixture means fresh URLs _and_ fresh movetext.

## Where to look

- `docs/reference/glossary.md` — what a term means
- `docs/explanation/modules/chess.md` — rules and notation boundaries
- `docs/explanation/modules/repertoire.md` — deviation vs gap vs
  book-ended, in full
- `libs/infra/platforms/normalize.ts` — the one place a PGN becomes a row
