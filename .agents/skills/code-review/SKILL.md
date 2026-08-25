---
name: code-review
description: Perform a read-only review of a VelaChess branch, diff, pull request, commit, or work in progress for correctness, regressions, security, domain semantics, architecture drift, data loss, isolation, and meaningful missing tests. Use when asked to review code or before merging a change that crossed boundaries.
---

# Review a change

Read the root and nearest `AGENTS.md` and the live code around every changed
seam. This procedure reports findings; it does not modify files, stage changes,
approve, or post comments unless the user separately authorizes that action.

## Workflow

1. Establish intent from the request and any explicitly linked issue or design.
2. Establish scope from the supplied base; for work in progress include staged,
   unstaged, and untracked files.
3. Classify each changed behavior and load only the relevant skills:
   - ownership, boundaries, or slice placement -> `architecture-review`
   - PGN/FEN/moves/perspective -> `chess-domain`
   - import/provider/cursor/dedup -> `game-ingestion`
   - Stockfish/evaluation/classification -> `engine-analysis`
   - repertoire/deviation/exercise/FSRS -> `repertoire-training`
   - inconsistent cross-boundary state -> `debug-pipeline`
   - auth/secrets/redirects/outbound HTTP -> `security-review`
   - UI ownership/composition -> `ui-before-you-build`
4. Trace input, authorization, effects, persistence, delivery, and observable
   output. A green suite supports the trace; it does not replace it.
5. Apply only the relevant review lenses:
   - success, refusal, empty, retry, and partial-failure behavior;
   - malformed or absent data and consistent transport contracts;
   - query-level user isolation, uniqueness, cascades, and transactional pairs;
   - stored and derived values using the same semantic rule;
   - thin composition roots, dependency direction, and native mechanism
     ownership;
   - tests whose oracle can disagree with the implementation.
6. Report only actionable findings. Ignore style-only preferences, generic
   clean-code advice, speculative abstractions, and unrequested redesigns.

Order findings by severity. Each finding names a precise location, observable
impact, evidence, and the smallest credible correction direction. If there are
no findings, say so and state any residual risk or verification unavailable.

```text
[P1|P2|P3] concise finding
location: path:line
impact: observable failure or violated invariant
evidence: traced contradiction or missing independent oracle
direction: smallest credible correction, without implementing it
```
