---
name: skill-creator
description: Design, create, refactor, merge, move, or delete VelaChess agent skills and guidance. Use when deciding whether recurring knowledge belongs in AGENTS.md, a skill or reference, a script, normal docs, or mechanical enforcement, and when repository changes may make guidance stale.
---

# Maintain agent guidance

Maintain one small, vendor-neutral VelaChess knowledge system. Start from real
work, find the existing owner, and subtract before adding.

## Start with evidence

Collect a recurring mistake, repeated review finding, non-obvious invariant,
debugging procedure, or stable decision that agents must rediscover. A topic,
feature, or technology name alone does not justify a skill.

Inspect the applicable `AGENTS.md`, existing skills, live code, tests, and normal
docs before changing guidance. Prefer updating, merging, moving, simplifying, or
deleting an existing owner.

## Choose the owner

```text
always relevant in a subtree       -> nearest AGENTS.md
recurring conditional procedure    -> skill
conditional workflow detail        -> skill reference
repeated deterministic operation   -> script
product or feature behavior        -> code, tests, and normal docs
mechanically enforceable invariant -> types, schemas, constraints, tests, or lint
obvious or generic knowledge        -> do not maintain
```

Create or retain a skill only when its knowledge recurs, is non-obvious,
materially changes behavior, applies beyond one incident, and has no clearer
owner. Compose focused skills instead of copying their rules into routers.

## Keep the skill small

Use a short lowercase kebab-case name and a matching folder. Treat the
frontmatter description as routing infrastructure: state what the skill does
and when realistic task vocabulary should trigger it.

Keep `SKILL.md` focused on workflow, decisions, project-specific hazards, and
routing to canonical sources. Use `references/` only for substantial detail
needed in some invocations, and `scripts/` only when a repeated deterministic
operation materially improves reliability. Do not add a README, changelog,
vendor metadata, placeholder directory, or auxiliary file without a consumer.

## Preserve canonical ownership

`.agents/skills` is the canonical source for shared skills. `.claude/skills`
and `.cursor/skills` may expose one only through a committed relative symlink.
Never maintain an independent vendor copy, and add an adapter only for a tool
that currently needs it.

Whenever architecture, terminology, tooling, workflow, or domain semantics
change, remove or update guidance that became false, redundant, or unnecessary.
Do not preserve `legacy-*`, `old-*`, or compatibility copies without a consumer.

The root guidance test enforces folder/frontmatter agreement, unique names,
resolved local links, and shared vendor adapters. Review description quality,
canonical ownership, live examples, terminology, and duplication manually;
then run formatting and the relevant repository checks.
