---
name: architecture-review
description: Review or place VelaChess behavior for ownership, dependency direction, cohesion, unnecessary abstraction, vertical-slice boundaries, and boundary drift. Use before moving code, adding a route or worker behavior, introducing a workspace or shared abstraction, or changing which layer owns behavior.
---

# Review architecture and place behavior

Reconstruct the live behavior and its invariants before judging its shape.
Repository docs and guidance explain intent, but current imports, tests, schema,
and execution paths decide what exists.

## Review a boundary

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

## Place behavior in the existing architecture

Read the nearest `AGENTS.md`, `docs/explanation/architecture.md`, and
`.dependency-cruiser.cjs`, then:

1. Name the request, user action, or system event that executes the behavior.
2. Keep behavior that changes with it in the owning `libs/<module>/<slice>`
   directory (see root `AGENTS.md`'s "Modules and slices" for the module
   list). A slice never imports a sibling slice's handler directly, same
   module or not — it declares its own narrow dependency type and the
   composition root wires the real implementation in.
3. Keep HTTP translation in `apps/server`, delivery translation in
   `apps/worker`, technical mechanisms in `libs/infra`, and stable shared domain
   rules in the existing domain libraries (`libs/chess`, `libs/scheduler`) or,
   when only one module's slices need it, as a module-root pure policy (no
   DB/queue/provider dependency of its own).
4. Group frontend code by user or domain behavior; shared UI and global
   infrastructure do not become parallel application layers.

If placement needs a new shared boundary, return to the review matrix and prove
that boundary before creating it. When no stronger owner is established, keep
the behavior with the request or event that changes it.

## Route specialized decisions

Route specialized questions instead of reproducing their rules:

- Chess, ingestion, engine, or training boundaries: the corresponding domain
  skill.
- Queue/worker behavior that is already inconsistent: `debug-pipeline`.

Do not change domain behavior inside a readability refactor. Report a proven
bug separately with the smallest correction and an observable test.

Verify enforced dependency, slice, and cycle boundaries with:

```bash
pnpm architecture
```
