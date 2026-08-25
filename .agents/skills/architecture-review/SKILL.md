---
name: architecture-review
description: Review a proposed or existing VelaChess structure for ownership, dependency direction, cohesion, unnecessary abstraction, and boundary drift. Use before moving code, introducing a workspace or shared abstraction, or changing which layer owns behavior.
---

# Review architecture

Reconstruct the live behavior and its invariants before judging its shape.
Repository docs and guidance explain intent, but current imports, tests, schema,
and execution paths decide what exists.

For each candidate, identify:

```text
RESPONSIBILITY  what it owns today
COHESION        whether those responsibilities change together
BOUNDARY        which details cross an ownership line
COMPLEXITY      concepts the caller must hold at once
ENFORCEMENT     code/test/schema that protects the decision
VERDICT         keep | simplify | move | split | delete
```

Prefer subtraction. Extract only when the new boundary removes a concept from
its caller or owns a stable mechanism/domain rule. Similar code, function
length, two implementations, or visual consistency do not earn an abstraction.

Route specialized questions instead of reproducing their rules:

- Slice or adapter placement: `vertical-slice-architecture`.
- Chess, ingestion, engine, or training boundaries: the corresponding domain
  skill.
- Queue/worker behavior that is already inconsistent: `debug-pipeline`.

Do not change domain behavior inside a readability refactor. Report a proven
bug separately with the smallest correction and an observable test.
