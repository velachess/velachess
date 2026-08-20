---
name: Pattern detector proposal
about: Propose a new deterministic mistake-pattern detector
title: "[pattern] "
labels: pattern
assignees: ""
---

See `docs/poc/contributing/adding-a-pattern.md` and `docs/poc/pattern-taxonomy.md`
before filling this out.

**Pattern name / slug**

e.g. `missed-fork`

**What mistake does it detect**

Plain-language description.

**Is this reliably derivable from chess.js and/or Stockfish output alone?**

Detectors must never guess — if the signal isn't cleanly computable from
existing data (or you're not sure), say so here; that's useful information
even if the answer is "not yet."

**Known false-positive / false-negative risks**

Detectors favor false negatives over false positives (`AGENTS.md`: "silence
is better than fabrication"). Note any edge cases you're aware of.

**Example positions**

One or more FEN/PGN snippets showing the pattern firing, and ideally one
showing a near-miss that should NOT fire.
