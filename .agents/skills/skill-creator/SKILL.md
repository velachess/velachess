---
name: skill-creator
description: Design, create, refactor, merge, move, or delete VelaChess agent skills and guidance. Use when deciding whether recurring knowledge belongs in AGENTS.md, an existing or new skill, references, scripts, normal docs, or mechanical enforcement, and when architecture, tooling, terminology, or domain changes may make guidance stale.
---

# Skill Creator

Maintain one small, vendor-neutral VelaChess knowledge system. Start from real
work, find the existing owner, and subtract before adding.

## Start with evidence

Collect concrete examples: a recurring mistake, repeated review finding,
non-obvious invariant, repeated debugging procedure, or stable decision that
agents must rediscover. A topic, feature, or technology name alone does not
justify a skill.

Before creating anything, inspect the applicable `AGENTS.md`, existing skills
and references, live code, tests, and normal docs. Prefer updating, merging,
simplifying, moving, or deleting existing guidance when it already has an
owner.

## Choose the owner

```text
always relevant in a subtree       -> nearest AGENTS.md
recurring conditional procedure    -> existing skill, or a new skill if unowned
detailed conditional knowledge     -> references/
repeated deterministic operation   -> scripts/
product or feature behavior        -> code, tests, and normal docs
mechanically enforceable invariant -> types, schemas, constraints, tests, or lint
```

Do not turn skills into an alternative product specification or duplicate
facts that code can state or enforce. Keep generic framework knowledge out
unless VelaChess uses it in a non-obvious way that changes decisions.

## Decide whether a new skill earns its existence

Create a new skill only when all of these are true:

- the procedure or knowledge recurs across realistic tasks;
- it is non-obvious and materially changes agent behavior;
- it is reusable beyond one feature or incident;
- no `AGENTS.md`, existing skill, code contract, test, or normal document is the
  clearer owner;
- composition or a focused update would not solve the problem with fewer
  concepts.

Normal PR review is the governance gate. Do not add a separate approval ritual
for creating a skill.

## Design the smallest useful skill

Use the Agent Skills shape:

```text
.agents/skills/<skill-name>/
|-- SKILL.md
|-- references/  # only for conditional detail
|-- scripts/     # only for repeated deterministic work
`-- assets/      # only for material used in outputs
```

Every `SKILL.md` starts with:

```yaml
---
name: skill-name
description: What the skill does and when realistic task vocabulary should trigger it.
---
```

Use a short lowercase kebab-case name, and make the folder equal the frontmatter
`name`. Treat the description as routing infrastructure: include both what the
skill does and when it applies, with vocabulary that appears in real requests.

Keep `SKILL.md` focused on workflow, important invariants, decision points,
routing, and high-value examples. Move substantial knowledge needed only in a
particular case to a linked reference. Do not fragment a short skill into tiny
references that merely add navigation.

Use `scripts/` only when the same deterministic operation is repeated and a
script materially improves reliability. Do not add a skill README, changelog,
installation guide, vendor metadata, placeholder directory, or auxiliary file
without a concrete consumer.

Compose skills instead of copying specialized rules. A router should say which
skill to load and why; the specialized skill remains the sole owner of its
procedure or domain semantics.

## Preserve canonical ownership

`.agents/skills` is the canonical source for shared skills. `.claude/skills`
and `.cursor/skills` may expose a canonical skill only through a committed,
relative symlink. Never maintain an independent `SKILL.md` in a vendor folder,
and add an adapter only for a tool that currently needs discovery there.

## Maintain and validate

Whenever architecture, terminology, tooling, dependencies, workflow, or domain
semantics change, ask whether any `AGENTS.md`, skill, or reference became false,
redundant, misleading, or unnecessary. Update or delete it in the same change.
Prefer deletion over `legacy-*`, `old-*`, `deprecated-*`, or compatibility
copies without a current consumer.

After changing guidance, verify:

1. every skill folder matches its valid kebab-case frontmatter `name`;
2. every description explains both what and when with useful trigger terms;
3. `SKILL.md` remains concise and every linked reference resolves;
4. examples, paths, APIs, terminology, and dependency claims match live code;
5. repository search finds no duplicated ownership or stale renamed concepts;
6. vendor entries are relative symlinks that resolve into `.agents/skills`;
7. no vendor folder contains a separately maintained skill copy;
8. normal formatting and relevant repository checks pass.

References are guidance, not truth over the implementation. Verify live code
before relying on current paths, symbols, schemas, provider behavior, or library
versions.
