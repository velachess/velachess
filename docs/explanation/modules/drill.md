# libs/application/drills

**[DRILL] — turns judged deviations into recallable exercises.** Pure
rules only: eligibility triage, exercise seeding, answer checking, grade
mapping. Persistence lives in `libs/infra/db`; deciding _when_ to review is
the scheduler's job, not this package's. Zero runtime dependencies — the
whole package is functions over plain data.

## Flow

```
deviations (judged + severity)             exercises                  drill responses
┌──────────────────────────────┐  triage  ┌──────────────────────┐   ┌────────────────────────┐
│ type: "deviation"            │ ───────► │ one per              │──►│ correct: boolean       │
│ engine_category: "mistake"   │ eligible │ (user, position_key) │   │ grade: again|good      │
│ position_key, expected_sans  │          │ expected_sans        │   │ response_time_ms (null)│
│ drillable: false → true      │          │ ◄─ N deviations      │   │ → scheduler cycle      │
└──────────────────────────────┘          │   (exercise_sources) │   └────────────────────────┘
                                          └──────────────────────┘
                                            dedup: the same position in
                                            two games = one exercise
```

## Eligibility — the triage rule

`eligibleForDrill(row, { minSeverity? })` passes a judgment only when all
three hold:

1. **`type === "deviation"`** — only the owner's own move is drillable.
   A `gap` has no answer to recall (the opponent left book), `book-ended`
   has no prepared line to remember, `completed` has no mistake at all.
2. **A prepared answer exists** (`expectedSans` non-empty) — an exercise
   with nothing to recall isn't one.
3. **The engine confirmed harm**: `engineCategory` present and at or
   above the floor (default `"inaccuracy"`). Two deliberate consequences:
   an unanalyzed deviation is _not_ eligible — analysis is a
   prerequisite, not a nice-to-have — and a deviation the engine rates
   `"ok"` never becomes a card. Leaving your line for an equally good
   move is not a mistake to fix, and filling a review queue with
   non-mistakes is the known failure mode of this kind of system.

The floor is a parameter, not a buried constant — real calibration comes
with real usage. The `drillable` flag stays on the deviation (triage is a
fact about the deviation, not about the exercise); the caller runs the
pure rule and persists via `setDrillable`.

## Exercise identity and provenance

An exercise is `(user, position_key)` — EPD, the same key the repertoire
package indexes by. The same deviation point reached in two games merges
into one exercise with two rows in `exercise_sources`, enforced by a
unique index rather than by caller discipline. Re-upserting refreshes
`expected_sans` (the preparation may have been edited) and adds the new
provenance.

Deliberately not stored: full FEN (EPD reconstructs a playable position —
move counters don't affect the legality of the answer move), side to move
(derivable from the EPD), difficulty or themes (later cycles), chapter
name (reachable through the source deviation's snapshot).

## Answering and grading

`checkAnswer(exercise, san)` is strict SAN membership — any prepared
answer counts as correct. The caller converts UI input (a piece drag, a
Move object) to SAN with the chess package's `makeSan`; this module never
parses moves.

`gradeResponse({ correct, responseTimeMs? })` maps binary correctness to
the four-value grade scale: `"good"` on correct, `"again"` on wrong.
`"hard"`/`"easy"` are reserved for signals not collected yet —
`response_time_ms` already persists so the future mapping has data to
learn from, but it deliberately does not affect the grade today. The db
enum carries all four values from day one; extending the mapping later is
a code change, not a migration.

## Testing

The eligibility matrix (4 judgment types × 5 severity states ×
answer present/absent) runs as pure unit tests. The e2e in
`libs/infra/db/__tests__/drill-flow.test.ts` chains the real pipeline —
judgment → engine signal → triage → deduped exercise with provenance →
right and wrong answers → graded responses read back — plus the two
counter-cases that define the rule: a harmless deviation creates nothing,
and an unanalyzed one isn't eligible.

## Layout

```
eligibility.ts   eligibleForDrill, EligibilityInput, Severity
exercise.ts      ExerciseSeed, seedFromDeviation
answer.ts        checkAnswer, gradeResponse, DrillGrade, ExerciseResponse
index.ts         public surface
```
