# How to add a package

Before anything: **most changes do not need a new package.** A package
earns its place when it owns a vocabulary the others should not reach
into. Two implementations of something do not justify one. If you are
unsure, put it in the package that already owns the concept and split
later — splitting is cheap, merging is not.

## Steps

**1. Create the folder** under `packages/<name>/`. `pnpm-workspace.yaml`
already globs `packages/*` and `apps/*`; nothing to register.

**2. `package.json`**, matching the others exactly:

```json
{
  "name": "@velachess/<name>",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./index.ts",
  "types": "./index.ts",
  "exports": { ".": "./index.ts", "./*": "./*.ts" },
  "scripts": {
    "lint": "oxlint .",
    "fmt": "oxfmt .",
    "fmt:check": "oxfmt --check ."
  }
}
```

Source is published as TypeScript — no build step, no `dist/`. The apps
compile it.

**3. `index.ts`** with a header comment saying what the package owns and,
just as usefully, what it refuses to own. Re-export the public surface
from there; nothing outside imports a deep file that `exports` does not
name.

**4. Register the path in three places.** Miss one and the failure is
confusing rather than loud:

- `tsconfig.json` → `paths`, both `@velachess/<name>` and
  `@velachess/<name>/*`
- `vitest.shared.ts` → `aliases`. pnpm's strict linking means a bare
  `@velachess/<name>` import only resolves from a package's own
  `node_modules` if it declared the dependency — this is the runtime
  fallback every project's `vitest.config.ts` shares.
- the `dependencies` of every package that imports it, as
  `"@velachess/<name>": "workspace:*"`

**4a. `packages/<name>/vitest.config.ts`**, the project itself:

```ts
import { defineConfig } from "vitest/config";

import { aliases, backendTest } from "../../vitest.shared.ts";

export default defineConfig({
  test: { ...backendTest, name: "<name>", include: ["**/*.test.ts"] },
  resolve: { alias: aliases },
});
```

The root `vitest.config.ts` discovers it automatically — `libs/*` and
`packages/*` are both globbed. Nothing to register there.

**5. Declare the boundary in `.oxlintrc.json`.** If the package must not
depend on something, say so with `no-restricted-imports` scoped to its
files, with a message explaining why. `libs/chess` is a leaf rules
package; `libs/infra/engine` talks UCI and nothing else. A boundary that
lives only in a doc is a boundary that erodes.

**6. Write `docs/explanation/modules/<name>.md`.** What it owns, why it
exists separately, and which decisions inside it are deliberate. This is
where a future reader — human or agent — learns not to "fix" something
on purpose.

**7. Tests beside the code**, in `packages/<name>/tests/`. They run
in the package's own project (step 4a) automatically.

## Dependency direction

```
apps/server, apps/worker → libs/<module> → domain packages + ports
```

A business module never imports pg-boss directly — only the queue ports.
`db` never imports a business module. A new package that needs to break
this is a design question, not a config one: use the `architecture-review`
skill before adding it.

## After

Run the gates in `docs/how-to/verify-a-change.md`, and `pnpm install` so
the workspace links the new name.
