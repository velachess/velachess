# Snapshots

Use a snapshot when the serialized output itself is the stable contract and a
reviewer can understand the diff. Prefer explicit assertions for API contracts,
chess semantics, security behavior, and what a user reads or does.

- `toMatchSnapshot()` writes a sibling snapshot artifact.
- `toMatchInlineSnapshot()` keeps a small expected value beside the assertion.
- `toMatchFileSnapshot()` is appropriate for a meaningful text or generated
  file format and must be awaited.
- `pnpm exec vitest run <filter> -u` updates snapshots. Review every change;
  never update snapshots merely to make a failure green.
- Commit external snapshot files with the test. CI does not update missing,
  mismatched, or obsolete snapshots by default.
- In concurrent tests, use the test context's `expect` so Vitest associates the
  snapshot with the correct test.

Do not snapshot entire React trees when an accessible role, name, state, or
piece of visible copy states the requirement more clearly. Avoid custom
serializers or matchers until repeated stable output proves they are needed.

Primary reference: [Vitest Snapshots](https://vitest.dev/guide/snapshot.html).
