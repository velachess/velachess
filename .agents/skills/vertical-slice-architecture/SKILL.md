---
name: vertical-slice-architecture
description: Read before creating, moving or refactoring any backend or frontend code in VelaChess — a new endpoint, a worker job, a query, a screen behavior. Says where code belongs (which slice, or infra, or a domain lib), what the boundaries forbid, and the decision rule when unsure. The architecture is Bogard's Vertical Slice Architecture; docs/explanation/architecture.md is the full statement and __tests__/architecture.test.ts enforces it.
---

# Vertical slices, in practice

`docs/explanation/architecture.md` is the document. This is the working
procedure — what to do at the keyboard.

## Before writing backend code

1. **Name the request.** What user or system behavior causes this code to
   execute? That name (`sync-account`, `submit-answer`) is the slice.
2. **Find or create the slice** under `libs/application/<area>/<slice>/`.
   The area is navigation; the slice is the unit. No internal template —
   one file is a valid slice.
3. **Keep it local.** Validation, SQL, mapping, errors, calculations and
   the test live in the slice directory. A query used only here does not
   go to `libs/infra/db`.
4. **Wire it at the edge.** `apps/server` route or `apps/worker` consumer
   unpacks the transport and calls the slice — nothing more. HTTP zod
   stays in the route (it types the hc client).
5. **Run `__tests__/architecture.test.ts`.** It rejects lib→app imports, hono
   or pg-boss inside application, infra importing application, layered
   directory names, and undeclared cross-slice imports.

## What not to do

- Do not create a Service/Repository/Controller for the noun. Two slices
  with similar SQL are correct; one shared abstraction coupling them is
  not — unless it is infra, a stable domain concept, or intentionally
  public (`packages/*`, a product decision).
- Do not call another slice. If you think you need to, check the
  allowlist in `__tests__/architecture.test.ts` and the exceptions section of
  the architecture doc; extending them is a recorded decision.
- Do not normalize slices to look alike. `get-overview` is one file;
  `process-analysis` is an engine room. Both are right.

## Frontend

Same idea inside `apps/web/src/<area>/`: organize by user behavior, keep
a behavior's queries/state/ui/tests together, no global
components/hooks/utils buckets. Primitives come from `libs/ui` (see the
`ui-before-you-build` skill); the query client, router and HTTP client
stay global.

## When unsure

Apply, in order: which request runs this code? → does it change with that
request? (yes: slice) → is it a broad technical mechanism? (yes:
libs/infra) → intentionally public? (yes: packages) → shared only by
resemblance? (keep local) → is the abstraction earned by observed
complexity? (no: simpler). Default: behavior stays close to the request
that owns it.
