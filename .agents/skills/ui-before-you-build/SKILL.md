---
name: ui-before-you-build
description: Choose the correct VelaChess UI owner and existing primitive before implementing a component, screen state, panel, badge, form, loading state, or empty state. Use for UI work in apps/web or apps/site and when deciding whether code belongs in libs/ui.
---

# Choose UI before building it

Read the target app's `AGENTS.md` and `libs/ui/AGENTS.md`. Search the existing
`@velachess/ui` exports and neighboring compositions before adding a primitive.

If registry work is needed, load the library-local
`libs/ui/.agents/skills/shadcn/SKILL.md` and work from `libs/ui`.

Use this decision order:

1. Existing `@velachess/ui` primitive or layout.
2. Composition local to the product vertical that owns the behavior.
3. Registry component installed into `libs/ui` after previewing its diff.
4. New generic primitive only when repeated product use has earned it.

Preserve these boundaries:

- `libs/ui` owns tokens and generic presentation; apps own product vocabulary,
  routing, translation, server state, and behavior.
- User-visible and accessibility copy is Lingui-owned by the app. UI primitives
  receive already-resolved labels through props.
- Use semantic tokens from `libs/ui/src/styles/theme.css`; do not add hex values,
  app-local themes, dynamic Tailwind class construction, or screen-level
  `dark:` variants.
- A skeleton represents absent data. Keep meaningful content visible while
  progress continues.
- Derive state at render/query boundaries instead of synchronizing duplicate
  state with effects.

When writing a new primitive, record in the change what existing component or
registry item was checked and why it did not fit.
