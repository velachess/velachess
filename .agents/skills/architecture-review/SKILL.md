---
name: architecture-review
description: Review or refactor VelaChess code with this repo's criteria — cognitive complexity over function length, ownership boundaries (pg-boss vs worker vs application vs domain), subtraction before abstraction. Use before proposing any structural change.
---

# Architecture review

Read before proposing. Reconstruct the real flow, identify invariants,
then evaluate. Never big-bang; never change domain behavior during a
readability refactor (a proven bug is a separate BUG FIX commit).

## Per file, answer

```
RESPONSIBILITY   what does this file own today?
COHESION         do those responsibilities belong together?
COGNITIVE COMPLEXITY  is the main flow readable top-to-bottom?
BOUNDARY         does it know details of a layer it shouldn't?
TESTABILITY      can the important rules be tested without infra?
REFACTOR CANDIDATE   yes / maybe / no
```

## The extraction metric

Before extracting a function ask: **does this remove a concept from the
caller?** `resolveGamePerspective(game)` removes username normalization +
fallback semantics — good. `getAcquired(result)` wrapping
`result.rows[0]?.ok` removes nothing — indirection, reject.

## Ownership rule (queue/worker/application)

pg-boss owns delivery, retry timing, concurrency, DLQ, heartbeat — in
`packages/queue` config, never re-implemented in consumers (no `for(;;)`,
no `sleep`, no deadlines). Workers answer only "which use case does this
job trigger?". Application owns what completing an operation _means_.
Infra details (`rows[0]`, SQL shapes, pg-boss options) are correct inside
their boundary file, smells outside it.

## Classify each finding

```
GOOD AS IS            simple, don't touch
MINOR READABILITY     small local gain, no architectural relevance
REFACTOR CANDIDATE    accidental complexity worth changing
ARCHITECTURAL SMELL   wrong responsibility or boundary
```

For each candidate show CURRENT / WHY IT IS HARD / PROPOSED SHAPE /
BENEFIT / COST / VERDICT (refactor | keep). Prefer deletion over
wrapping. If the code is fine, say keep.

## Do not propose

Factories/strategies for two implementations, classes without concrete
need, one-line semantic-free helpers, splitting cohesive functions by
line count, moving pg-boss concerns into application, or breaking the
transactional invariants (judgment+enqueue; report+severity).
