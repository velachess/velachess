---
name: shadcn
description: Search, inspect, add, compare, or update shadcn and configured registry components in the existing VelaChess libs/ui library. Use for registry-owned UI source or libs/ui/components.json, not for composing application screens or initializing a new project.
---

# Manage registry components in `libs/ui`

Work from `libs/ui` with the repository-installed `pnpm exec shadcn` CLI.
Read `components.json`, neighboring components, and workspace exports before
writing.

```bash
pnpm exec shadcn search @shadcn -q "<terms>"
pnpm exec shadcn view @shadcn/<name>
pnpm exec shadcn add <name> --dry-run
pnpm exec shadcn add <name> --diff
```

Add only after reviewing destination, dependency, and overwrite effects.
Generated source becomes owned VelaChess code: preserve intentional local
behavior, use workspace aliases, and export it consistently from
`libs/ui/package.json`.

Do not run project initialization or preset migration commands unless the user
explicitly requests a design-system migration. Do not install registry files in
apps, overwrite customized source without a diff, add application vocabulary or
Lingui to `libs/ui`, or create a second token source. Use the root
`ui-before-you-build` skill for the preceding ownership decision.
