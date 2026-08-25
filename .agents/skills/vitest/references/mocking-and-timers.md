# Mocking, spies, and timers

Mock the boundary a test intentionally controls, not the behavior it claims to
verify. Prefer a dependency's supported test API and VelaChess's existing
harnesses before writing a mock.

## Functions, spies, modules, and globals

- `vi.fn()` creates a controlled function and records calls and results.
- `vi.spyOn(object, key)` observes or replaces an existing method; restore it
  after the test.
- `vi.mock(module, factory)` is hoisted. Its factory cannot safely depend on
  ordinary top-level variables; use `vi.hoisted` only when that ordering is
  genuinely required.
- `vi.doMock` is not hoisted and affects subsequent dynamic imports. Use
  `vi.resetModules()` only when module-level state is part of the behavior.
- `vi.mocked(value)` helps TypeScript treat an already mocked value as mocked;
  it does not create the mock.
- `vi.stubGlobal` must be paired with `vi.unstubAllGlobals`.

For partial module mocks, import the original through the mock factory instead
of copying the module's behavior into the test. Avoid mocking deep internal
modules merely to reach an implementation branch; choose a supported seam.

Cleanup APIs have different meanings:

```text
vi.clearAllMocks()    -> clear call history, keep implementations
vi.resetAllMocks()    -> clear history and reset mock implementations
vi.restoreAllMocks()  -> restore originals replaced by spies
vi.unstubAllGlobals() -> restore globals changed with vi.stubGlobal
```

Use the narrowest cleanup that restores isolation. Broad resets can hide which
test owns state and can erase an intentionally shared setup.

## Fake timers and dates

Use fake timers for deterministic timer behavior in a focused unit, not around
real PGlite, pg-boss, Stockfish, network, or Testing Library workflows whose
schedulers the test does not own.

```ts
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("retries after five seconds", async () => {
  startRetry();
  await vi.advanceTimersByTimeAsync(5_000);
  expect(onRetry).toHaveBeenCalledOnce();
});
```

Prefer asynchronous advancement (`advanceTimersByTimeAsync`,
`runAllTimersAsync`, or `runOnlyPendingTimersAsync`) when callbacks can schedule
promises. `vi.setSystemTime` controls the current date after fake timers are
enabled; restore real timers after the test. Guard `runAllTimers` against code
that recursively schedules timers.

Primary references: [Vitest Mocking](https://vitest.dev/guide/mocking.html) and
[Vi API](https://vitest.dev/api/vi.html).
