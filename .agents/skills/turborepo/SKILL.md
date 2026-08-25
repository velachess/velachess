---
name: turborepo
description: Change or debug VelaChess Turborepo task orchestration, workspace filters, dependencies, cache behavior, environment inputs, outputs, persistent tasks, root tasks, or CI execution. Use when editing turbo.json, workspace task scripts, task topology, or investigating a task that runs, caches, or invalidates incorrectly.
---

# Work on the VelaChess task graph

Read `turbo.json`, the affected workspace scripts, `package.json`,
`pnpm-workspace.yaml`, and `.github/workflows/ci.yml`. Document the graph that
exists; do not import generic Turborepo conventions without a current need.

Current ownership:

- Root scripts are the stable human/CI entry points; Turbo orchestrates workspace
  tasks beneath them.
- `test`, `typecheck`, `lint`, and `build` are cacheable unless a workspace task
  declares a reason otherwise.
- `dev` and `start` are persistent and uncached. Database generation/migration
  is uncached because it changes external state or generated artifacts.
- Root Vitest projects use Turbo's `//#<task>` syntax. App/library-specific test
  environment inputs are declared on the owning task.
- Build outputs differ: ordinary apps use `dist/**`; the static site owns
  `.next/**` and `out/**`; Lighthouse owns its reports.

When changing the graph:

1. Confirm the app or library is included by the pnpm workspace and owns the script.
2. Express only real upstream dependencies; avoid `dependsOn` added for visual
   ordering.
3. Declare environment variables and outputs that affect cache correctness.
4. Keep side-effecting, watch, and long-running tasks uncached as appropriate.
5. Run the affected filtered task, then the root entry point named in
   `docs/how-to/verify-a-change.md`.

Prefer Turbo and pnpm filtering primitives over custom orchestration scripts.
Do not add remote-cache or hosted-service assumptions; local and self-hosted
workflows must remain valid.
