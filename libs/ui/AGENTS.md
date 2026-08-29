# Agent Guide — `libs/ui`

Extends `../../AGENTS.md`. Read that first; this file only states what is
different or additional for the design system.

## Purpose

Owns theme tokens, generic primitives, layout, icons, charts, and generic
chess presentation. Read `docs/explanation/modules/ui.md` before changing a
public contract or the theme.

## Boundaries

- The library has no router and no VelaChess application vocabulary.
  Generic chess presentation belongs in `src/chess`; chess rules do not.
- `src/styles/theme.css` is the only token source. `globals.css` imports it
  and adds product-wide dependencies and Tailwind source scanning.
- Components do not translate. Accessibility labels and other copy enter
  through props from the consuming app.
- Registry components are installed here, reviewed as owned source, and
  exported through `package.json`. Apps consume them through
  `@velachess/ui`; they never install their own copy.
- Preserve React and React DOM as peer dependencies.

## Local skill

- `libs/ui/.agents/skills/shadcn` — use when searching, adding, comparing, or
  updating registry components or `components.json`.
