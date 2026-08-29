# Cycle: cutting drills loose from the repertoire

Today an exercise can only be born from a repertoire deviation. This cycle
opens a second origin — the mistake the engine flagged — and wires both into
the analysis screen.

This is not a design preference. It is structure:

```ts
exerciseSources {
  exerciseId
  deviationId  // notNull()
}
```

`notNull`. Recording an exercise that came from a blunder is impossible today,
and `eligibleForDrill` doubles down: `if (row.type !== "deviation") return false`.

The practical effect: a repertoire covers the opening, so **every mistake after
it is invisible to drilling**. A blunder on move 34 has no deviation attached
and cannot have one.

## The fact that shapes the solution

Graded plies are not rows:

```ts
gameAnalyses { positions: jsonb().$type<StoredGradedPly[]>() }
```

They are one blob per analysis. There is no `game_plies` to reference, so the
"engine mistake" origin cannot be a foreign key — it has to be the natural key
`(gameId, ply)`.

Creating a plies table purely to earn the FK would mean migrating the entire
storage format of analysis for the sake of one relationship. The natural key is
cheaper and says the same thing.

## What does not change

**Exercise identity.** `uniqueIndex("exercises_user_position")` over
`(userId, positionKey)` — the same position reached in two games is _one_
exercise with two provenances. That is already right, and it now holds across
origins too: deviate from your preparation in a position, and blunder in the
same position another day, and it is one exercise with two records of where it
came from.

**FSRS.** `cards`, `drillResponses`, the scheduling — none of it knows where
an exercise came from, and it keeps not knowing.

---

# Part 1 — backend

## 1.0 · Drill is the module, not the origin

Before the migration, the decision that shapes it: **drill is a broad module**.
The two origins in this cycle are the _suggested_ ones — they come out of your
own games. Later come the **fixed** ones: mate in two, tactical patterns,
opening drilling, the catalog every product on the market has.

That changes the modeling. A nullable column per origin, with a `CHECK`
listing combinations, works for two and becomes a patch on the third. The type
has to be named:

```sql
CREATE TYPE drill_origin AS ENUM ('repertoire-deviation', 'engine-blunder');
-- 'curated' joins here when the fixed drills arrive
```

That way the third origin is a new value plus the columns it needs, not a
rewrite of the constraint.

**One consequence worth recording before walking into it:** an exercise is
`(userId, positionKey)`. A curated mate in two is the same position for
everyone, so it becomes one row per user. That is duplication, and it is the
price of the FSRS card being personal. Acceptable — just do not discover it
with the catalog already published.

## 1.1 · Migration: a named origin

`exercise_sources` stops requiring a deviation and starts saying where it came
from.

```
id            uuid PRIMARY KEY
exercise_id   uuid NOT NULL
origin        drill_origin NOT NULL     ← new
deviation_id  uuid NULL                 (was NOT NULL)
game_id       uuid NULL  → games(id) ON DELETE CASCADE
ply           integer NULL
```

The composite key `(exercise_id, deviation_id)` no longer works — part of it
becomes nullable. Partial unique indexes give idempotency without a sentinel:

```sql
CREATE UNIQUE INDEX exercise_sources_deviation
  ON exercise_sources (exercise_id, deviation_id)
  WHERE deviation_id IS NOT NULL;

CREATE UNIQUE INDEX exercise_sources_ply
  ON exercise_sources (exercise_id, game_id, ply)
  WHERE game_id IS NOT NULL;
```

And the `CHECK` ties each origin to the columns it requires — named per origin,
so the next one is one more clause rather than a rewrite:

```sql
ALTER TABLE exercise_sources ADD CONSTRAINT exercise_sources_origin_shape CHECK (
  (origin = 'repertoire-deviation'
     AND deviation_id IS NOT NULL AND game_id IS NULL AND ply IS NULL) OR
  (origin = 'engine-blunder'
     AND deviation_id IS NULL AND game_id IS NOT NULL AND ply IS NOT NULL)
);
```

**Acceptance:** both origins insert; a declared origin missing its column
fails; a filled column without the matching origin fails; repeating does not
duplicate.

## 1.1b · Selection: rank and budget, do not raise the floor

Measured on real games (~342 plies, both sides together):

|            | total | still in play |
| ---------- | ----- | ------------- |
| blunder    | 48    | 44            |
| inaccuracy | 36    | 29            |
| mistake    | 22    | 18            |

**Blunder is the most common mistake category**, above inaccuracy. At this
level the tail is the body — and a fixed floor is wrong at both ends: at
`blunder` a strong player gets two drills a month and the product looks dead;
at `inaccuracy` a beginner gets ten a game and drowns.

So volume does not come from the floor. It comes from **ranking by
`winChanceLoss` and cutting at a per-game budget**. That calibrates itself
without modeling the player: someone who blunders gets blunders, someone who
only plays inaccuracies gets inaccuracies.

`minSeverity` stays, as an absolute minimum — never drill `ok`. It stops being
the volume knob.

A pure rule, next to `eligibleForDrill`, testable without a database:

```ts
selectDrillCandidates(
  plies: GradedPly[],
  opts?: { budget?: number; minSeverity?: Severity },
): GradedPly[]
```

**Acceptance:** sorts by descending loss, not by ply; respects the budget;
never returns `ok`; a clean game returns empty; a tie on loss is deterministic
(broken by ply) — otherwise the same report yields a different list on every
run.

**Rejected, and why:** filtering by "the position was already decided" using
`evalBefore`. The numbers above say 92% of blunders happen with the position
still in play — because it is the blunder that _causes_ the decided state, and
`evalBefore` is the reading from before it. The filter would cut `good` and
`best`, which would never become drills anyway.

## 1.2 · `libs/application/drills`: the rule already exists, it is just trapped

`eligibleForDrill` mixes two questions: _is it the right type_ and _did it hurt
enough_. The second holds for both origins; the first does not.

And the severity rule **does not need writing twice**, because the translation
between the two scales already exists:

```ts
// libs/analysis/classify.ts, already in the repository
toEngineCategory(category); // best|good → ok; the rest passes through
```

Analysis speaks in five categories, `deviations` stores four. A graded ply goes
through that function and lands in the same `SEVERITY_ORDER` the repertoire
uses. One scale, one floor, both sides.

So 1.2 is smaller than it looked:

```ts
// pulled out of eligibleForDrill, now shared
export function severeEnough(category: EngineCategory, min?: Severity): boolean;

// still exists, with the severity part delegated
export function eligibleForDrill(row: EligibilityInput, opts?): boolean;
```

**There is no `eligibleFromEngine`.** The engine path does not have a second
eligibility rule — it has `selectDrillCandidates` (1.1b), which already applies
floor and budget. One function fewer than the plan's first draft claimed.

**Acceptance:** `ok` never drills on either side; `best` and `good` collapse to
`ok` before the rule; changing `minSeverity` affects both origins equally.

### Addendum — the severity floor does not apply to the repertoire

Written after building both origins and comparing what they actually fire
on. `eligibleForDrill` required the engine to confirm the deviation hurt,
and that made this origin a near-subset of the other one: the engine grades
every ply of the game, opening included, so a deviation severe enough to
clear the floor was already being drilled as a blunder. Two origins firing
on the same moves are one origin with extra bookkeeping.

They are not asking the same question:

|            | asks                               | fires when          |
| ---------- | ---------------------------------- | ------------------- |
| engine     | did you play **well**?             | you lost win chance |
| repertoire | did you play what you **decided**? | you left the book   |

Playing a sound alternative to your own preparation costs zero evaluation,
so the engine is permanently silent about it — and that is exactly the
failure repertoire drilling exists to catch. The rule is now: your own
deviation, with a prepared answer to recall. Nothing about severity.

It also stops waiting for analysis, which removes a trap: a game analysed
before the repertoire existed never gets re-analysed, so its deviation
would have stayed undrillable forever.

**Volume needs no budget here.** `deviations_game_repertoire` is unique on
`(game_id, repertoire_id)` — one deviation per game per repertoire. The
engine path needs a budget because a game holds many bad plies; this one
holds at most one departure.

## 1.3 · `libs/application/drills`: the second seed

```ts
export interface ExerciseSeed {
  positionKey: string;
  expectedSans: string[];
  origin:
    | { kind: "repertoire-deviation"; deviationId: string }
    | { kind: "engine-blunder"; gameId: string; ply: number };
}
```

`seedFromDeviation` already exists and only gains the `origin` wrapper. The
variant names match the `drill_origin` enum — if they drift, somebody will be
mapping strings by hand somewhere.

`seedFromGradedPly` is new, and has a real difficulty: the engine answers in
**UCI** (`g1f3`) and `expectedSans` stores **SAN** (`Nf3`). The conversion needs
the position, and the position is right there in `StoredGradedPly.fen`.

That conversion already exists twice — `bestMoveSan` in `apps/web` and the
`parseUci`/`makeSan` pair in `@velachess/chess`. **The third copy must not be
written.** It belongs in `libs/application/drills`, importing `@velachess/chess`, and the
web one starts calling that.

And it has to be as suspicious as the web one already is: a record that drifted
out of sync with its FEN returns `null` rather than an exercise whose "correct"
answer is an illegal move.

**Acceptance:** UCI becomes SAN in the ply's position; an illegal move yields
`null` and no exercise; promotion (`e7e8q`) converts correctly; the web copy is
gone.

### Addendum — the position key is derived, not passed

Written after the fact, because the first implementation got it wrong and a
test caught it.

The repertoire keys a position by **EPD** (`makeFen(..., { epd: true })` — a FEN
without the halfmove clock and move number), while `seedFromGradedPly` was
handed the raw FEN by its caller. Same position, two keys, two exercises: the
move counters alone were splitting one drill in half. The `e2e` suite asserted
`exercises === 2` with a comment explaining they were different positions. They
were not.

`positionKeyOf` now lives in `@velachess/chess` as the single answer, and
`seedFromGradedPly` derives the key from `ply.fen` instead of accepting one.
A caller cannot get it wrong because a caller no longer supplies it.

The counters describe how a position was _reached_, not what it is. Keying on
them would also mean the same choice arrived at by a different move order was a
different exercise.

### Addendum — when two origins collide, preparation wins the answer

Also written after the fact. Once the keys matched, the two origins started
landing on the same row, and `onConflictDoUpdate` let the last writer set
`expectedSans` — so the engine's preference quietly overwrote your book.

The rule now: a repertoire seed refreshes `expectedSans`; an engine seed only
adds its provenance. The engine is a strong opinion about the position; your
repertoire is a decision about what you intend to play, and drilling should not
redrill you away from it without saying so. The engine origin still earns the
exercise its place in the queue — it just does not get to rewrite the answer.

## 1.4 · `libs/infra/db`: the engine's candidate list

`listTriageCandidates` stays as it is — that one is the repertoire's.

Beside it, one that reads the blob:

```ts
listEngineDrillCandidates(db, userId, opts?: { gameId?: string })
```

It joins `gameAnalyses` → `games` → `tracked_accounts` to know **which side is
the user's** (you do not drill your opponent's mistakes), opens `positions`, and
returns the graded plies above the floor that do not yet have an exercise with
that origin.

The "already has one" filter cannot be `notExists` over `deviationId` like the
other one — it is over `(game_id, ply)`.

**Acceptance:** only plies on the user's side; only above the floor; running
twice does not return what already became an exercise; `gameId` narrows to one
game.

## 1.5 · `libs/application`: triage with a scope

```ts
triageAndSeed(db, userId, scope?: { gameId?: string }): Promise<TriageOutcome>
```

It now sweeps both origins. `TriageOutcome` gains the split, because a single
number hides which half worked:

```ts
{
  reviewed: number;
  seeded: number;
  byOrigin: {
    deviation: number;
    engine: number;
  }
}
```

Still idempotent by construction, which is what makes re-running safe.

## 1.6 · Triage runs automatically

Triage is plumbing. Nobody presses "triage" — they press "drill", and the
triage has already happened. `triageAndSeed` had been an HTTP route with no
caller; the route is gone and the call hangs off the two events that produce
something to triage.

**Two hook points, not one**, because the two orderings reach the user
differently:

| ordering                      | who triages         | without it                          |
| ----------------------------- | ------------------- | ----------------------------------- |
| repertoire → judge → analysis | `completeAnalysis`  | fine                                |
| analysis → repertoire → judge | `judgeGamesForUser` | the deviation never becomes a drill |

The second ordering is not exotic: it is what happens to anyone who reviews a
few games before building a book. The analysis ran when no deviations existed,
so its triage had nothing to seed; the judge then creates the deviation already
carrying severity, read from the cached report. Nothing would ever re-analyse
that game to fix it.

The extraction e2e only exercises the first ordering and stays green either
way, which is why `judge-triage.test.ts` exists separately.

**Acceptance:** analysing a game with two of your own blunders leaves two
exercises with nobody asking; judging against a cached report seeds too;
redelivering either does not duplicate.

## 1.7 · Contract: analysis counts its drillables

`GET /games/:id/analysis` gains a summary — from the same source as the
category table, so the number can never lie:

```ts
drills: {
  /** Your plies, above the floor, in this game. */
  eligible: number;
  /** Of those, the ones that are already an exercise. */
  seeded: number;
  /** False until triage has run — the UI waits rather than
   *  announcing zero, which would read as "nothing to drill". */
  triaged: boolean;
}
```

`triaged` is what prevents the screen's worst state: analysis ready, triage
still queued, CTA saying "0 positions" for a game full of mistakes.

**Acceptance:** `eligible` matches the sum of drillable categories on the
user's side; before triage, `triaged` is false.

## 1.8 · Contract: a session per origin

`GET /drill/next` gains an optional `?source=engine|deviation`, and the
response says where the exercise came from — the drill screen needs to know
whether the right answer is _your preparation_ or _the engine's move_, because
the sentence explaining it is a different sentence.

---

# Part 2 — vocabulary

Settled before the UI, because half the files the UI touches change name.

## 2.0 · `drill` leaves the vocabulary

The package is called `drill` and internally speaks only `drill`:
`eligibleForDrill`, `seedFromDeviation`, `ExerciseSeed`. The outside name was
the only thing out of tune.

```
libs/application/drills/         → libs/application/drills/
apps/web/src/drill/     → apps/web/src/drill/
route /drill            → /drill
```

Three words, each with a job:

|            | What                                               |
| ---------- | -------------------------------------------------- |
| **drill**  | the practice item — position, right answer, origin |
| **review** | the FSRS session: scheduling, interval, lapse      |
| ~~drill~~  | nothing. It goes.                                  |

`review` was already reserved by an earlier decision — it is `ts-fsrs`'s term of
art. The product vocabulary keeps that distinction instead of introducing a
third synonym.

## 2.1 · `/mistakes` dies; `/overview` and `/insights` split

`/stats` held two things of different natures, and the Dashboard pulled both:

```
getOverview    4 count(*) — the state right now      → GET /overview
listAdherence  adherence across games                → GET /insights/adherence
```

A count is a photograph; adherence over time is a film. Together in one
endpoint, the Dashboard would load a time series to show four numbers.

`overview` is not a new word: `getOverview`, `overviewSchema` and the `Overview`
type already said it — only the route disagreed. And `insights` names what the
reader gains rather than the shape of the data: "statistics" promises numbers,
and the half worth having here is what you did not know about yourself.

```
route /mistakes         → deleted
apps/web/src/mistakes/  → deleted
GET /stats              → GET /overview
GET /stats/adherence    → GET /insights/adherence
```

A raw list of mistakes by date is a log, and nobody opens a log to improve. The
scope that was worth keeping — patterns crossing games — is `/insights`.

Routes all become nouns naming what you are looking at:

```
/games  /games/:id  /drill  /insights  /repertoire
```

---

# Part 3 — UI

Nothing here starts before part 1 closes. A CTA with no destination is worse
than no CTA.

## 3.1 · The move list moves into the Move tab

Today it sits outside the tabs, with the comment `"Always here, and the only
thing that scrolls"`. The effect: whoever is reading the Report has a
move-by-move list underneath that has nothing to do with what they are reading.

Each tab becomes self-sufficient:

|            | Content                                 | Scope    |
| ---------- | --------------------------------------- | -------- |
| **Move**   | the verdict on the move + the move list | one ply  |
| **Report** | opening, category table, CTAs           | the game |

A layout consequence the current comment already anticipates: the list was the
only scrolling region, and the report's rows pushed it down. With the change,
**each tab scrolls on its own**. It is simpler, and the coupling between one
tab's height and the other's scroll disappears.

**Acceptance:** switching tabs leaves no move list visible in the Report; the
list still scrolls and marks the current ply; one tab's height does not move
the other's.

## 3.2 · Report: macro, with two CTAs of different weight

Report becomes the balance sheet of the game. It gains two exits, which **must
not carry the same weight** — two large blocks compete and neither wins.

**Primary — a block, counted, an action:**

> **Drill your mistakes** · Review 5 positions and find the better move →

It is an action about this game, it is what closes the loop, and the number
comes from the same source as the table just above it, from the **user's side**
only. In that screenshot: 4 blunders + 4 mistakes + 3 inaccuracies for
yurimutti — not the opponent's 6+1+7. The caption has to say whose count it is,
or somebody adds the two columns and the number looks like a lie.

Three states:

|         | When                                                       |
| ------- | ---------------------------------------------------------- |
| Counted | `triaged` and `eligible > 0`                               |
| Absent  | `triaged` and `eligible === 0` — clean game, no invitation |
| Waiting | `triaged === false` — analysis arrived before triage       |

**Secondary — a quiet link, navigation:**

> See your patterns →

It goes to `/insights`. It is the gesture of pulling the camera back: _that was
one game; what about in general?_ It is not an action, it is navigation, so it
is text and not a block.

**Acceptance:** the number matches the user's side in the table; a clean game
renders no block; the waiting state does not announce zero; the `/insights` link
does not compete visually with the block.

## 3.3 · The Move tab gets no CTA

Whoever is there is following the board move by move. Most moves are fine, so
the button would appear intermittently — and intermittent presence teaches
people to ignore it. The badge on the square already says that move was bad.

## 3.4 · `/drill`

`GET /drill/queue` → the pile → `GET /drill/next` → board → accept the
move → `POST /drill/answer`.

`Board` already has what this screen needs: arrow, badge, animation,
`interactive` with `onMove` returning the verdict.

The sentence that explains changes with the origin — _"your preparation said
Nc3"_ against _"the engine preferred Nc3"_ — which is why 1.8 exists. And it is
where the fixed drills slot in later, without changing the screen.

**Acceptance:** right and wrong take distinct paths; with nothing due, an empty
state rather than a blank screen; the origin changes the explanation.

## 3.5 · `/insights`

It receives `GET /insights/adherence` and becomes the home of the scope that
crosses games: recurring weakness, trend, performance by color and by time
control, best and worst openings.

Almost all of that is a new query over data that already exists — `timeClass`,
`openingEco` and `openingName` are on `games`, and accuracy comes out of what
analysis already records. **Rating over time is the exception**: we store the
player's rating at import time, not per game, so rating progression needs new
schema.

---

# Order

```
2.0 rename  →  1.1 migration  →  1.2 rule  →  1.3 seed  →  1.4 query
                                                             ↓
                                                   1.5 triage → 1.6 automatic
                                                                     ↓
                                                   1.7 contract → 3.1 tabs → 3.2 Report
                                                   1.8 contract → 3.4 /drill
```

The rename comes first: doing it later means rewriting imports across
everything the earlier steps created.

## Recorded risks

**The UCI→SAN conversion becomes a third copy if nobody is paying attention.**
It already exists in two places. It moves to `libs/application/drills` and the web
imports it.

**`positions` is jsonb, so engine triage reads and iterates in memory.**
Acceptable for one game; if it ever becomes a sweep over full history, that is
the first thing to hurt.

**Only the user's side.** The join with `tracked_accounts` is what stops you
drilling your opponent's mistake, and it is easy to forget in a query that
already looks finished.

**One position, one key.** Two origins keying the same position differently
seeded it twice for a while — see the addendum to 1.3. Anything that computes a
position key outside `positionKeyOf` will reintroduce it.
