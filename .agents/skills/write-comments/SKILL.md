---
name: write-comments
description: Write or review VelaChess comments, docstrings, configuration prose, README text, and inline explanations so they preserve decisions or external constraints without restating code. Use when adding explanatory prose or when a file is accumulating comments.
---

# Write only what code cannot say

Delete the proposed comment mentally. Keep it only if a decision, rejected
alternative, external constraint, or prevented bug is lost.

- Do not restate names, types, control flow, or history available from Git.
- Prefer one precise idea. If it needs paragraphs, put maintained reasoning in
  `docs/` and leave a short pointer at the decision site.
- Config and `.env.example` files get one short line only when a value is
  non-obvious or easy to misuse; operational reasoning belongs in a how-to.
- Module docstrings state ownership and refusal boundaries, then stop.
- Everything committed is English.

Comments must follow live behavior. If code changes remove the reason, delete
the comment in the same change.
