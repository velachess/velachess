# Drills

Facts about drill generation, the review queue, and FSRS scheduling.
Reasoning: [`explanation/modules/drill.md`](../explanation/modules/drill.md).

## Exercise identity

An exercise is `(user_id, position_key)` — EPD via `positionKeyOf`, unique
index `exercises_user_position`. The same position reached from different
games or origins is one exercise with several provenance rows.

Collision rule (`upsertExercise`, `libs/infra/db/queries/drill.ts`): when the
position already exists, a repertoire-kind seed (`repertoire-deviation`,
`repertoire-line`) updates `expected_sans`; an `engine-blunder` seed only adds
its provenance row and does not change the expected answers.

## Origins (`drill_origin` enum)

| Origin                 | Source                          | Rule                                                                    | Required columns on `exercise_sources` |
| ---------------------- | ------------------------------- | ----------------------------------------------------------------------- | -------------------------------------- |
| `repertoire-deviation` | `deviations` rows               | `type === "deviation"` and non-empty `expected_sans`. **No severity or analysis requirement** | `deviation_id`                         |
| `engine-blunder`       | `game_analyses` jsonb plies     | user's side only; category floor `inaccuracy` (`severeEnough`); ranked by `winChanceLoss` desc, ply asc; **budget 5 per game** (`selectDrillCandidates`); engine's UCI best converted to SAN in the ply's FEN, illegal → no exercise | `game_id` + `ply`                      |
| `repertoire-line`      | chapter decision positions      | every decision position, seeded when the chapter lands                   | `chapter_id`                           |

Per-origin idempotency comes from partial unique indexes; the
`exercise_sources_origin_shape` CHECK ties each origin to exactly its columns.

Triage (`triageAndSeed`) runs automatically after analysis completes and after
judging; it is idempotent. On the deviation path, a position that already has
a scheduled card is pulled due-now (`pullCardDueNow` — moves `due` to now,
never later).

## Queue contract

`getReviewItem` (`libs/application/drills/get-next-drill/`):

1. Oldest due card: `listDueExercises` — `due <= now`, `ORDER BY due ASC`.
2. Else a never-scheduled exercise: `getNewExercise` — `LIMIT 1` with **no
   `ORDER BY`**; the pick order among new exercises is undefined.
3. Else null.

There is no interleaving of new and due, no daily new-card limit, no
randomization, and no retirement (no lapse cap, no "mastered" state; an
exercise whose source rows are all gone is still served, with a neutral
context). Scope parameters narrow both piles: `origin`, `repertoireId`,
`chapterId` (`drillScopeCondition`).

Context precedence for the drill screen (`drillContextOf`):
`repertoire-deviation` > `repertoire-line` > `engine-blunder`.

## Answering and grading

- `checkAnswer`: strict SAN membership in `expected_sans`; any prepared answer
  counts.
- `gradeResponse`: correct → `good`, wrong → `again`. `hard`/`easy` exist in
  the enum and the FSRS mapping but are never produced. `response_time_ms` is
  persisted and unused in the grade mapping.

## FSRS configuration (production)

- `ts-fsrs` pinned `5.4.1` (FSRS v6), wrapped by `libs/scheduler/scheduler.ts`
  — the only file importing it.
- `makeScheduler()` is called with no options (`apps/server/src/main.ts`), so
  library defaults apply: `request_retention = 0.9`,
  `maximum_interval = 36500` days, fuzz off, default weights and learning
  steps. With these defaults a new card graded `good` is due +10 min, `again`
  +1 min, `easy` +8 days.
- One card per exercise (`cards`, unique `exercise_id`). Fields: `due`,
  `stability`, `difficulty`, `elapsed_days`, `scheduled_days`,
  `learning_steps`, `reps`, `lapses`, `phase`
  (`new | learning | review | relearning`), `last_review`. "Is due" is always
  derived (`due <= now`), never stored.
- `forecast(cards, days)` exists in `libs/scheduler` with tests and has no
  callers in app code.

## Routes

- `GET /drill/queue` — counts: `due`, `fresh` (no card yet), `byOrigin` (an
  exercise with two origins counts once per origin; the piles do not sum).
- `GET /drill/next` — next item + `previewIntervals` for all four grades.
- `POST /drill/answer` — check, record response, review card.

## Tables

`exercises`, `exercise_sources`, `cards`, `training_responses`
(`libs/infra/db/schema.ts`); migrations `0006_train.sql`, `0007_scheduler.sql`,
`0010_drill_origin.sql`, `0013_origin_shape.sql`.
