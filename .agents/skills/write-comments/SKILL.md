---
name: write-comments
description: Read before writing a comment, a config file, a README, or a docstring in VelaChess. One rule — comments carry what the code cannot say, and nothing else. Use when a file starts accumulating explanation, when writing .env/docker/config files, or when reviewing prose in a diff.
---

# Comments carry what the code cannot say

A comment earns its place by holding something unreadable from the code
itself: a decision and its alternative, a constraint from outside the
repo, a bug this shape prevents. Everything else is noise a reader must
parse before reaching the code.

## The test

Delete the comment. If nothing was lost, it should have been deleted.

Restating the line below it loses nothing:

```ts
// Set the port to 3000
const port = 3000;
```

Naming the constraint does:

```ts
// pg-boss needs its own connection: a session advisory lock outlives
// the query that took it.
const lockSql = postgres(url, { max: 1 });
```

## Config and env files

An `.env.example` is a form to fill in, not a manual. One line per
variable, only where the value is non-obvious or a mistake is likely:

```bash
# 32+ chars. Generate: openssl rand -base64 32
VELACHESS_AUTH_SECRET=change-me-to-a-random-32-character-secret
```

Not the reasoning, not the failure mode, not the deployment topology —
those live in `docs/how-to/`, once, where they can be maintained. A
config file that explains itself at length goes stale silently, because
nobody diffs prose.

## What this looks like in practice

- **One idea per comment.** If it needs a second paragraph, it is
  documentation; move it to `docs/` and leave a pointer.
- **Say the "instead of".** "X because Y" is worth twice "X".
- **No section banners, no restating types, no changelogs.** Git holds
  history; the type holds the shape.
- **Module docstrings state the file's job in a sentence or two**, then
  stop. The rest belongs next to the line that earned it.
- **Same rule for user-facing prose**: an error message, a doc paragraph
  and a commit body all say the thing and stop.

Volume is not thoroughness. A file where every line is annotated reads
as one where nothing is important.
