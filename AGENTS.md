# VelaChess — Agent Guide

Durable repository-wide guidance for coding agents. Read the nearest nested
`AGENTS.md` when working inside a repository subtree; it owns rules that are always
relevant in that subtree.

## Product

VelaChess imports a player's chess.com and Lichess history (or a PGN file) and
lets them review each game with Stockfish: every move graded, the better
continuation shown on the board, the results saved.

The same core must work in local development, self-hosted installations, and
hosted deployments. Keep domain behavior portable and environment/provider
adapters thin. Do not introduce a mandatory proprietary service or an
abstraction for a hypothetical provider.

## Repository map

```text
apps/server       Hono HTTP composition root
apps/worker       pg-boss consumer composition root
apps/web          TanStack Start product SPA
apps/site         Next.js static public site

libs/accounts     tracked-account lifecycle: connect, list, refresh
libs/games        the game record: read, list and import PGN
libs/analysis     the Stockfish job lifecycle: request, watch, process, get
libs/user         the person: first-user bootstrap and profile avatar
libs/infra        db, queue, engine, logger, platforms, storage, and auth
libs/chess        chess rules and notation
libs/ui           shared design system and chess presentation
libs/fixtures     pure test data
libs/test-utils   shared test harness
```

Backend dependency direction:

```text
apps/server, apps/worker -> libs/<module> -> libs/infra + domain libs
```

Nothing under `libs/` imports from `apps/`. A business module imports ports,
not Hono or pg-boss. Infra does not import a business module. The enforced
boundary and documented exceptions live in `docs/explanation/architecture.md`
and `.dependency-cruiser.cjs`.

A boundary that is structural — which directory may import which — belongs in
`.dependency-cruiser.cjs`. A boundary that is semantic — intent, public vs.
private usage inside a slice, one file legitimately serving two purposes —
belongs in the nearest `AGENTS.md` and is enforced by code review, not a
regex. Do not add a dependency-cruiser rule that approximates a semantic
boundary; a false positive on a legitimate case is worse than an unenforced
rule stated in `AGENTS.md`.

## Modules and slices

The backend is organized as vertical slices grouped into flat business
modules (see `docs/explanation/architecture.md` for the full rationale).
This section is the precise model; when code and this section disagree,
fix whichever is wrong.

- **Slice** — owns one behavior (e.g. `sync-account`, `import-pgn`).
  Declares its own narrow dependency function types, in its own
  vocabulary, for everything external: DB reads/writes, queue enqueue,
  provider HTTP, and any other slice's behavior. A slice never imports or
  receives a `Database`, `AnalysisQueue`, `SyncQueue`, or
  another slice's handler directly.
- **Module** — a package under `libs/<module>` grouping slices that change
  together (e.g. `analysis` owns `request-analysis`,
  `process-analysis`, `watch-analysis`). May hold shared **pure** policies/calculators at the
  module root (no DB/queue/provider dependency of their own — e.g.
  `libs/analysis/accuracy.ts`).
- **Module API (`index.ts`)** — what the module offers the rest of the
  system. The only file reachable from outside the module, structurally
  (package `exports`, non-wildcard `tsconfig.json` paths) and by
  dependency-cruiser rule. Not a convenience barrel: an export exists
  there iff a route/worker consumer calls it directly, or composition-root
  wiring needs it.
- **Slice-declared dependency** — the narrow function type a slice writes
  for each external need, named in its own vocabulary rather than
  imported from whatever satisfies it. Duplicating this _type_ across
  every caller is expected and fine; duplicating the real _implementation_
  is not.
- **Composition root** (`apps/server/src/composition/*.ts`,
  `apps/worker/src/composition/*.ts`) — maps DB clients, queue clients,
  provider HTTP clients, and other modules' `index.ts` capabilities onto
  the exact narrow function types slices declared. This is also how one
  slice's need for a _sibling_ slice's behavior gets satisfied, same
  module or not — never a direct import.
- **Dependency rule** — the one distinction that resolves every case:

  | From → to                                | Allowed?                | Mechanism                                                                                                     |
  | ---------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------- |
  | slice A → slice B's handler              | **No**                  | A declares a dependency type; composition wires the real B handler in, whether A and B share a module or not. |
  | slice A → a module-level pure policy     | **Yes**, direct import  | Deterministic, no I/O of its own — no trust boundary to protect, so no ceremony.                              |
  | slice A needs a capability from module B | Via declared dependency | Composition sources the real implementation from B's `index.ts`.                                              |

- **Sharing rule** — a slice never imports a sibling slice's handler
  directly, **same module or not**. The only thing safe to import
  directly, without a Deps type or composition, is a module-root pure
  policy (no DB/queue/provider parameter). A stateful workflow that
  happens to sit next to other slices in the same module (e.g.
  `games/land-new-games`) does not qualify as a pure policy and gets no
  same-package exemption — it is external to every caller, including its
  own module-mates.

### Module → package → path

| Module   | Package               | Path             |
| -------- | --------------------- | ---------------- |
| accounts | `@velachess/accounts` | `libs/accounts/` |
| games    | `@velachess/games`    | `libs/games/`    |
| analysis | `@velachess/analysis` | `libs/analysis/` |
| user     | `@velachess/user`     | `libs/user/`     |

`libs/infra/*`'s seven packages are `@velachess/infra-db`,
`@velachess/infra-queue`, `@velachess/infra-engine`,
`@velachess/infra-logger`, `@velachess/infra-platforms`,
`@velachess/infra-storage`, and `@velachess/infra-auth` — the `infra-`
prefix keeps them visually distinct
from business modules at the import site, including from the business
`@velachess/user` above.

## Principles

- Prefer explicit code, deletion, and local duplication over speculative
  abstractions. A cohesive function is not a refactor target because it is
  long.
- Before building infrastructure, ask whether the current library or platform
  already owns it. Prefer native Better Auth, Hono, Postgres, Drizzle,
  pg-boss, Turborepo, TanStack, React, chessops, and Stockfish
  primitives over local replacements.
- Domain decisions are pure; effects belong at application/infra boundaries.
  Do not duplicate server state or derive the same fact through competing
  expressions.
- Preserve user isolation in every read and write. A public chess handle is a
  data source, not identity or proof of ownership.
- Tests assert observable behavior through the repository's supported seams.
  A fixture is evidence only of fields it actually contains, and a test must
  be capable of failing when the behavior is wrong.
- Everything committed is English: code comments, docs, test names, commit
  messages, and user-facing source copy. Conversations may use any language.
- Comments carry a decision, external constraint, or prevented bug that code
  cannot express. Put maintained reasoning in `docs/` rather than expanding an
  inline explanation into a second specification.

## Critical invariants

- The engine has one product trigger: opening a game. Importing and refreshing
  fetch and persist; they do not fan Stockfish analysis across an archive.
- An analysis report commits in one transaction.
- pg-boss owns delivery, retry, backoff, concurrency, heartbeat, and dead
  letters. The database session advisory lock owns analysis execution across
  HTTP and worker callers.
- Derived game perspective, result, and time class use one semantic rule across
  filters, lists, and analysis.
- Public and authenticated behavior must remain valid behind local, self-hosted,
  and hosted origins. Never weaken cookies, redirects, authorization, or tenant
  scoping for one deployment mode.

## Commands

```bash
pnpm check       # typecheck + lint + architecture + knip
pnpm architecture # dependency and cycle boundaries
pnpm fmt:check   # formatting gate
pnpm test        # unit and integration projects through Turbo
pnpm e2e         # root cross-system acceptance flows
pnpm build       # deployable apps
```

Read `docs/how-to/verify-a-change.md` before claiming a change is complete and
`docs/how-to/write-a-test.md` before adding tests. Read
`docs/how-to/turborepo.md` before changing task orchestration, caching, filters,
or affected-package behavior.

## Guidance routing

Always-relevant subtree rules belong in the nearest `AGENTS.md`:

- `apps/web/AGENTS.md` — frontend slices, state, i18n, routing, and rendering.
- `apps/site/AGENTS.md` — static public-site boundary.
- `apps/server/AGENTS.md` — HTTP, validation, auth middleware, and OpenAPI.
- `apps/worker/AGENTS.md` — delivery consumer ownership.
- `libs/<module>/AGENTS.md` — one per business module (`accounts`, `games`,
  `analysis`, `user`) — what it owns, its `index.ts` surface, and its cross-module
  dependency edges.
- `libs/infra/AGENTS.md` — technical adapters and portability.
- `libs/ui/AGENTS.md` — design-system ownership.

Task-dependent procedures live under `.agents/skills/`:

- Architecture, ownership, abstraction, or slice placement:
  `architecture-review`.
- Chess rules or representation: `chess-domain`.
- Import, sync, providers, identity, or deduplication: `game-ingestion`.
- Stockfish, evaluations, classification, or analysis persistence:
  `engine-analysis`.
- Cross-boundary inconsistent data: `debug-pipeline`.
- Change review: `code-review`, which routes to the relevant domain skills.
- Auth, OAuth, secrets, redirects, authorization, or outbound HTTP:
  `security-review`.
- UI primitives or screen composition: `ui-before-you-build`.
- Creating, restructuring, or retiring agent guidance: `skill-creator`.

Skill and reference content is guidance, not truth over the live system.
Verify paths, APIs, schemas, dependency versions, and provider behavior in the
current code before acting. When a change makes an `AGENTS.md`, skill, or
reference false, redundant, or unnecessary, update or delete it in the same
change. Do not keep `legacy-*`, `deprecated-*`, or compatibility copies without
a current consumer.

## Agent infrastructure

`AGENTS.md` is the standard instruction surface. `.agents/skills` is the
canonical source for reusable skills; vendor directories are symlink adapters
only. See `.agents/README.md` before changing this infrastructure.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
