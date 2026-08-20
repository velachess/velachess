# libs/scheduler

**[SCHEDULER] — spaced-repetition scheduling over plain card state.**
Domain-agnostic on purpose: nothing here knows what an exercise or a
chess move is. The boundary isn't a promise, it's a test — the acceptance
test schedules a vocabulary flashcard ("Haus" → "casa") through its whole
life, and the package compiles with zero imports from the rest of the
repo.

## Flow

```
drill responses                   libs/scheduler (pure)        cards (db)
┌─────────────────────────┐      ┌───────────────────────────┐    ┌───────────────────────────┐
│ grade: again|hard|      │ ───► │ review(card, grade, now)  │ ─► │ 1:1 with exercise         │
│        good|easy        │      │   → new state + due       │    │ due, stability,           │
└─────────────────────────┘      │                           │    │ difficulty, phase, lapses │
                                 │ previewIntervals(card)    │    └───────────┬───────────────┘
        future UI ◄───────────── │   → the four buttons,     │                │
                                 │     before answering      │                │
        "what's due?" ◄───────── │ effectiveStatus(card,now) │ ◄──────────────┘
        "what's coming?" ◄────── │ forecast(cards, days)     │
                                 └───────────────────────────┘
```

## Why a wrapper

`scheduler.ts` is the one file that touches `ts-fsrs` (pinned exact
version; FSRS v6, maintained by the algorithm's own organization).
Everything else — including `libs/infra/db` — speaks `CardState` and
`Grade`, plain data in the repo's vocabulary. The library's `Card` uses
numeric enums and snake_case names; the mapping lives in exactly one
place, and swapping the implementation (or surviving a breaking major)
costs this file, not a repo-wide grep.

`CardState` carries **every** field the algorithm needs to resume after a
reload — including `learningSteps`, `elapsedDays`, and `scheduledDays`,
which are easy to overlook and whose loss silently corrupts future
intervals. The persistence round-trip test (rebuild from JSON, schedule,
compare against the original) exists precisely because this mapping is
the wrapper's one fragile point.

## Stored vs. derived

`phase` (the algorithm's New/Learning/Review/Relearning) is a column.
"Is it due" is not — `effectiveStatus(card, now)` derives it by comparing
`due` with the clock, and `listDueExercises` derives it in SQL with
`due <= now`. A stored `is_due` flag would be duplicated state going
stale the moment it's written.

`forecast(cards, days)` buckets upcoming dues per local day (overdue
cards count on day one, new cards don't forecast) — the "how much review
is coming" question, answered from card state alone.

## The seam with drilling

The caller wires the loop: `recordResponse` (drilling) already produced a
grade → `getOrCreateCard` → `review(card, grade)` → `saveCard`. The
scheduler never learns what an exercise is; the db queries accept and
return `CardState` via `import type` only. Grades are structurally
compatible with the drilling package's — same four strings — without
either package importing the other.

## Testing

Pure units: the vocabulary card lifecycle (new → learning → review,
`again` → relearning + lapse), due dates only moving forward,
`previewIntervals` ordered easy ≥ good ≥ hard without mutating input,
`effectiveStatus` clock cases, forecast bucketing, and the persistence
round-trip. The e2e in `libs/infra/db/__tests__/scheduler-flow.test.ts` chains
cycles 0→3 into this one: real exercise → graded answers → persisted
reviews → due queue → forecast.

## Layout

```
card.ts        CardState, Grade, CardPhase, effectiveStatus, forecast
scheduler.ts   makeScheduler (review, previewIntervals, newCard) — the only ts-fsrs import
index.ts       public surface
```
