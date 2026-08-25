---
name: vitest
description: Apply Vitest 4.1 APIs and VelaChess test configuration for tests, suites, hooks, assertions, mocks, spies, timers, fixtures, snapshots, filtering, coverage, environments, projects, and type tests. Use when writing or debugging Vitest tests, changing vitest.config.ts or vitest.shared.ts, selecting a test project, or deciding whether test infrastructure is necessary.
---

# Vitest

Use the installed Vitest version and the live VelaChess project configuration,
not Jest assumptions or copied version-specific guidance. The repository
currently resolves Vitest 4.1.10; verify `package.json`, `pnpm-lock.yaml`, and
the relevant config before relying on a version-sensitive API.

## Workflow

1. Read the nearest `AGENTS.md` and `docs/how-to/write-a-test.md` to choose the
   supported seam and observable behavior.
2. Identify the owning Vitest project and its environment before writing setup
   or mocks.
3. Inspect official dependency testing utilities, then existing VelaChess
   fixtures, harnesses, setup files, and test helpers.
4. Write an isolated test whose oracle can disagree with the implementation.
   Mock only boundaries the test does not own.
5. Run the narrow project, file, or test name; make the behavior wrong and see
   the new test fail; then run the relevant broader gate.

## Prefer existing testing primitives

Before creating a manual mock, fake, fixture, test helper, wrapper, or custom
abstraction:

1. inspect the library's official testing API/utilities and current exports;
2. inspect existing VelaChess test utilities and fixtures;
3. prefer those supported primitives when they solve the requirement;
4. create custom testing infrastructure only when neither the dependency nor
   the repository already provides an adequate solution.

This applies especially to Better Auth and other framework or provider
integrations. Do not reimplement library behavior merely to make it testable.

## VelaChess boundaries

- Backend tests normally use the real PGlite migrations, shallow Stockfish,
  queue, or HTTP harness owned by the tested seam. Do not replace the subject
  with a mock and call the result integration coverage.
- Web tests render through Testing Library and let MSW own the HTTP boundary.
  Assert what a user can observe, not that a request or implementation detail
  occurred.
- `libs/test-utils`, `libs/fixtures`, app setup files, and nearby test helpers
  are the first places to search. Reuse them only when their contract matches;
  a fixture proves only the fields it contains.
- Tests must stand alone. Reset mutable state, restored globals, spies, module
  caches, and fake timers at the narrowest reliable lifecycle boundary.
- Snapshot breadth is not evidence of behavior. Prefer explicit assertions for
  contracts, domain semantics, and rendered user outcomes.

## Load detailed references only as needed

- Read [test-api.md](references/test-api.md) for `test`, `describe`, hooks,
  assertions, test context, fixtures, and type testing.
- Read [mocking-and-timers.md](references/mocking-and-timers.md) for `vi` mocks,
  spies, globals, module state, dates, and fake timers.
- Read [snapshots.md](references/snapshots.md) before adding or updating a
  snapshot.
- Read [configuration-and-running.md](references/configuration-and-running.md)
  for filtering, coverage, environments, projects, and the exact VelaChess
  commands and project names.

Official API documentation can change ahead of the installed dependency. When
they disagree, inspect Vitest 4.1.10's installed exports and types before
changing code or guidance.
