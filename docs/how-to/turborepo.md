# Work with the VelaChess task graph

VelaChess uses pnpm to define workspace membership and package scripts, and
Turbo to orchestrate those scripts from stable root commands. Read the live
`pnpm-workspace.yaml`, `package.json`, affected package manifests, `turbo.json`,
and relevant CI workflow before changing the graph; they are the source of
truth over this guide.

## Current graph

Package tasks come from each workspace's `package.json`. Root-only tasks use
Turbo's `//#<task>` form because they do not belong to a workspace.

| Root command                          | Task ownership                           | Repository role                                                       |
| ------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| `pnpm test`                           | package `test`, `//#test:root`           | Workspace unit/integration projects plus root repository checks       |
| `pnpm e2e`                            | direct root Vitest project               | Cross-system acceptance under `e2e/`                                  |
| `pnpm architecture`                   | direct root dependency-cruiser command   | Import, package, slice, auth, app and cycle boundaries                |
| `pnpm typecheck`                      | package `typecheck`, `//#typecheck:root` | Workspace-specific compilation plus the repository TypeScript project |
| `pnpm lint`                           | `//#lint:root`                           | One repository-wide oxlint run                                        |
| `pnpm build`                          | package `build`                          | Deployable application builds                                         |
| `pnpm dev`                            | package `dev`                            | Persistent local development processes                                |
| `pnpm db:generate`, `pnpm db:migrate` | package database tasks                   | Generated migrations and external database state                      |

The public site adds a `lighthouse` task. Its test depends on its build, and
Lighthouse depends on the site test. Web and site typechecks depend on their
own builds because those frameworks generate types consumed by compilation.
These dependencies express required inputs, not preferred visual ordering.

## Cache ownership

Turbo caches finite tasks unless the graph says otherwise. Ordinary build
output is `dist/**`; the site overrides that with `.next/**` and `out/**`, and
Lighthouse records `.lighthouseci/reports/**`. If a task produces reusable files
outside its declared outputs, a cache hit cannot restore them.

`dev` and `start` are persistent and uncached. Database generation and migration
are uncached because they create generated files or change external state. Do
not make watch processes, side-effecting tasks, or deployment operations
cacheable.

Environment variables that can change a task result belong in that task's
`env` inputs. The current graph declares database inputs for database-backed
tests and Lingui inputs for the web and site tests. Add an input only when the
task actually reads it; do not copy a broad environment list across tasks.

## Narrow and affected runs

Use a filter for quick feedback on one workspace:

```bash
pnpm exec turbo run test --filter=@velachess/db
pnpm exec turbo run build --filter=@velachess/site
```

A filtered run is not the repository gate. Finish with the root command named
in `docs/how-to/verify-a-change.md`.

CI uses affected-package selection only where skipping unaffected work is part
of that workflow's contract. Site quality runs `lighthouse --affected` with
explicit `TURBO_SCM_BASE` and `TURBO_SCM_HEAD`; React Doctor uses
`turbo ls --affected` to choose among the three React workspaces. Full CI still
runs architecture, unit/integration, E2E and build commands.

## Add or change a task

1. Confirm the package is included by `pnpm-workspace.yaml` and add the owning
   package script.
2. Add Turbo configuration only for a real dependency, cache policy, output, or
   environment input. A script does not need a decorative graph entry.
3. Add a root script only when humans or CI need a stable repository-wide entry
   point.
4. Inspect the graph with `pnpm exec turbo run <task> --dry-run=json` and run a
   filtered execution.
5. Run the corresponding root verification command.

Do not add `dependsOn` for sequencing that the task does not require, bypass an
existing root gate in CI, invent a parallel orchestration script, or make local
and self-hosted work depend on remote caching.
