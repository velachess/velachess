# Test API and context

Version scope: Vitest 4.1.10 as currently resolved by VelaChess. Confirm the
installed version before using newer options.

## Tests and suites

`test` and `it` are aliases; `describe` and `suite` are aliases. Use suites to
group behavior and shared lifecycle, not to make one test depend on another.

Common test forms include:

```ts
test("returns the current game", async () => {
  const result = await loadGame();
  expect(result.id).toBe(gameId);
});

test.each([
  ["1-0", "white"],
  ["0-1", "black"],
])("maps %s to %s", (result, winner) => {
  expect(winnerOf(result)).toBe(winner);
});
```

Vitest 4.1 supports options such as `timeout`, `retry`, `repeats`, `concurrent`,
`skip`, `only`, `todo`, `fails`, and configured tags. Use retries or repeats to
investigate a demonstrated timing problem, not to hide nondeterminism.
`test.sequential` is deprecated; use `{ concurrent: false }` when overriding an
inherited concurrent suite.

`test.only` is for local diagnosis and fails CI under Vitest's default CI
behavior. Do not commit it.

## Hooks

- `beforeEach` and `afterEach` establish and clean isolated per-test state.
- `beforeAll` and `afterAll` own an expensive resource only when tests do not
  mutate it in ways that couple their results.
- `aroundEach` and `aroundAll` are available in Vitest 4.1 for a genuine wrapper
  lifecycle; ordinary setup and cleanup should use the simpler hooks.

Await asynchronous hooks. Teardown must restore fake timers, globals, spies,
handlers, database state, and external resources even when an assertion fails.
Use the existing app or library setup file when state is shared by the whole
project.

## Assertions

Use the matcher that states the contract:

- `toBe` for identity and primitive equality;
- `toEqual` for structural equality, and `toStrictEqual` when prototypes,
  sparse arrays, or missing properties matter;
- `toMatchObject` or asymmetric matchers for intentional partial contracts;
- `resolves` and `rejects` for promises, always awaited;
- `toThrow` for synchronous failures;
- Testing Library matchers for rendered DOM behavior.

Use `expect.assertions(count)` or `expect.hasAssertions()` when a test could
silently skip an asynchronous or callback assertion. `expect.soft` may collect
multiple failures, but should not turn an invalid prerequisite into noisy
follow-on output.

Concurrent tests must use the `expect` supplied by their test context for
snapshots and assertion tracking:

```ts
test.concurrent("serializes a game", ({ expect }) => {
  expect(serialize(game)).toMatchSnapshot();
});
```

## Test context and fixtures

The context provides test-scoped `expect`, `skip`, task metadata, annotations,
and cleanup/failure callbacks such as `onTestFinished` and `onTestFailed`.
Prefer a local hook or `onTestFinished` for one test. Use `test.extend` only
when a typed fixture genuinely recurs and composition reduces setup without
hiding ownership.

Vitest 4.1 supports composable fixtures:

```ts
import { test as baseTest } from "vitest";

const test = baseTest
  .extend("account", () => createAccount())
  .extend("game", ({ account }) => createGame(account));
```

Use `test.override` for a suite-scoped fixture override. Do not use deprecated
`test.scoped`. Before introducing either API, inspect `libs/test-utils`,
`libs/fixtures`, app test directories, and the dependency's official testing
exports.

## Type testing

`expectTypeOf` and `assertType` express compile-time contracts. Vitest treats
`*.test-d.ts` as type tests when invoked with typechecking enabled:

```ts
import { expectTypeOf, test } from "vitest";

test("returns a normalized game", () => {
  expectTypeOf(normalizeGame).returns.toMatchTypeOf<NormalizedGame>();
});
```

VelaChess does not currently configure Vitest type-test projects or a coverage
gate. `pnpm typecheck` remains the repository-wide TypeScript gate. Add a
Vitest type-test configuration only for an actual public type contract that
ordinary compilation cannot prove clearly; do not assume `pnpm test` discovers
`*.test-d.ts` today.

Primary reference: [Vitest Test API](https://vitest.dev/api/test) and
[Testing Types](https://vitest.dev/guide/testing-types.html).
