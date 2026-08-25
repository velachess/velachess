# Agent Guide — `libs/application`

Extends `../../AGENTS.md`. This library owns what the system does: one vertical
slice per request or use case.

- A slice owns its validation beyond transport shape, queries used only by that
  behavior, errors, calculations, mapping, and tests.
- Slices do not import other slices except for the documented and enforced
  allowlist. Similar code in two slices is not automatically shared.
- A route or worker consumer calls a slice; a slice does not know Hono,
  pg-boss, process environment, or deployment topology.
- Broad technical mechanisms belong in `libs/infra`; stable domain concepts
  shared by several slices belong in the existing domain libraries. Do not
  create `services`, `repositories`, `commands`, `queries`, `core`, `common`,
  or `utils` layers.
- Start with the simplest transaction script that preserves the behavior and
  transactional invariants. Different slices do not need matching shapes.

Read `docs/explanation/architecture.md` and use
`architecture-review` before creating, moving, or extracting behavior.
Use the relevant domain skill when the slice depends on chess, ingestion,
engine, or training semantics.
