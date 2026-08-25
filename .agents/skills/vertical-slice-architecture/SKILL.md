---
name: vertical-slice-architecture
description: >
  Place or refactor VelaChess behavior by request, use case, or system event
  while preserving application, app, infra, and domain boundaries. Use when
  creating or moving a route behavior, worker job, application query, use case,
  or frontend vertical.
---

# Place behavior in a vertical slice

Read the nearest `AGENTS.md`, `docs/explanation/architecture.md`, and the live
architecture test before changing placement.

## Workflow

1. Identify the request, user action, or system event that executes the behavior.
2. Find or create the owning `libs/application/<area>/<slice>` directory. The
   area aids navigation; the request or event names the slice.
3. Keep validation beyond transport shape, use-case queries, mapping, errors,
   calculations, and tests with that behavior.
4. Keep HTTP translation in `apps/server` and delivery translation in
   `apps/worker`; each invokes the slice and stops.
5. If placement would require a new shared boundary, load
   `architecture-review`. This skill places behavior inside the existing
   architecture; it does not justify a new abstraction.

For frontend code, group by user/domain behavior and reuse shared UI and global
infrastructure rather than creating parallel abstractions.

When placement is unclear, identify the request or event that changes the code
and keep the behavior there until an architecture review establishes a stronger
owner.

## Verify

```bash
pnpm exec vitest run --project root __tests__/architecture.test.ts
```
