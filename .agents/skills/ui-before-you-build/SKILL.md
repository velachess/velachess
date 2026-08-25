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

The app and UI `AGENTS.md` files own tokens, translation, state, and composition
boundaries. Two hazards need an explicit check during the choice: a skeleton is
for absent data, not progress over meaningful content; and registry source must
land in `libs/ui`, never an app.
