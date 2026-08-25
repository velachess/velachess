# VelaChess agent architecture

This repository uses two open, vendor-neutral instruction surfaces:

- `AGENTS.md` contains guidance that is always relevant in its directory tree.
- `.agents/skills/<name>/SKILL.md` contains a reusable procedure loaded only
  when its description matches the task.

Skills may add `references/` for conditional detail, `scripts/` for repeated
deterministic work, and `assets/` only for material used in an output. Do not
create empty resource directories.

Use this ownership rule:

```text
always relevant in a subtree       -> nearest AGENTS.md
sometimes relevant procedure       -> skill
detailed conditional knowledge     -> skill reference
mechanically enforceable behavior  -> code, test, schema, lint, or tooling
feature behavior                   -> production code and normal docs
```

Root `.agents/skills` is canonical for procedures shared across repository areas.
A procedure used only by one subtree may live in that subtree's
`.agents/skills`. Vendor folders are adapters only: committed symlinks may
expose canonical skills to a tool that cannot discover `.agents/skills`
directly. Never maintain an independent copy through `.claude`, `.cursor`, or
another vendor directory.

The current shared-skill adapters are:

```text
.claude/skills/<name> -> ../../.agents/skills/<name>
.cursor/skills/<name> -> ../../.agents/skills/<name>
```

They exist only for vendor discovery. Canonical content remains exclusively
under `.agents/skills`; never edit or replace a symlink with a maintained copy.

Claude discovery also uses instruction adapters:

```text
CLAUDE.md -> AGENTS.md
<scoped subtree>/CLAUDE.md -> AGENTS.md
```

These symlinks expose the same hierarchical instructions; they are not an
independent source. Cursor reads the canonical `AGENTS.md` hierarchy directly.

No roles are currently maintained. Architecture and review are task-specific
procedures (`architecture-review` and `code-review`); implementation is normal
agent behavior. Add a role only when a persistent responsibility changes how
work is performed beyond what an `AGENTS.md` or skill can express.

## Skill lifecycle

Treat guidance like code. When architecture, workflow, terminology,
dependencies, or domain semantics change, ask whether any instruction became
false, redundant, misleading, or unnecessary. Update or delete it in the same
change.

Use `skill-creator` when creating, restructuring, merging, or retiring guidance.
It owns the classification and validation procedure; this README does not
duplicate it. There is deliberately no agent config registry, sync generator,
or marketplace. Adapters are added or removed manually with their current
consumer.
