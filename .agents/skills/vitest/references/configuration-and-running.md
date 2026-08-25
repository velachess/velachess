# Configuration and running tests

## Current VelaChess setup

VelaChess resolves Vitest 4.1.10. Root `vitest.config.ts` uses `test.projects`
to aggregate named configs; the older `workspace` terminology and
`vitest.workspace.*` configuration are deprecated in current Vitest.

The project split is intentional:

```text
root, e2e                    inline root projects; node
server, worker               app projects; node
application                  application library; node
analysis, chess, repertoire  pure/domain libraries; node
scheduler                    scheduling library; node
auth, db, engine, logger     infra libraries; node
platforms, queue             infra libraries; node
ui                           jsdom + Testing Library
web, site                    jsdom + Lingui/React transforms and setup files
```

`vitest.shared.ts` owns backend timeouts and aliases. Each app or library owns
its environment, include glob, and project name in its nearest
`vitest.config.ts`. Add or change a project there; do not turn the root
aggregator into a second source of app/library-specific behavior.

## Selecting the right run

```bash
pnpm test
pnpm test:e2e
pnpm exec vitest run --project db
pnpm exec vitest run apps/server/__tests__/api.test.ts --project server
pnpm exec vitest run --project web -t "shows analysis progress"
pnpm test:watch
```

`pnpm test` runs workspace test tasks plus the `root` and cross-app `e2e`
projects. `pnpm test:e2e` selects only the latter. A positional file filter
narrows collected files; `-t` or `--testNamePattern` narrows names; `--project`
selects one or more configured projects. Do not refer to a generic `core`
project: VelaChess has no project with that name.

Run by project before running a file when duplicate names or transforms could
select the wrong configuration. `test.only` is a local debugging tool, not a
committed filter.

## Environments

Backend and domain projects use `node`. `web`, `site`, and `ui` use `jsdom`.
Choose the environment for the APIs the subject actually needs; do not use
jsdom to conceal that domain or backend code depends on browser globals. A
file-level `// @vitest-environment <name>` override exists, but a recurring
difference usually deserves an explicit named project.

VelaChess enables Vitest globals in current projects, though most tests use
explicit imports. Follow the surrounding file; do not change global policy as
part of an unrelated test.

## Coverage

Vitest supports V8 and Istanbul providers through optional version-matched
packages and `test.coverage`. VelaChess currently has no coverage provider,
thresholds, or coverage script configured. Do not claim `pnpm test` enforces a
percentage.

When a real task requires coverage, first define what decision the report will
support, select the relevant project and source scope, install the provider
matching Vitest 4.1.10, and configure or invoke `--coverage` explicitly. Do not
add thresholds or a repository-wide coverage gate as incidental skill work;
behavioral oracles matter more than a percentage.

Primary references: [Vitest Projects](https://vitest.dev/guide/projects.html),
[Test Environment](https://vitest.dev/guide/environment.html), and
[Coverage](https://vitest.dev/guide/coverage.html).
