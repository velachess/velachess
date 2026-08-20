import path from "node:path";

/**
 * The one place a package's `@velachess/*` specifier is registered for
 * tests. pnpm's strict linking means a package only sees the workspace
 * dependencies it declares — bare `@velachess/x` imports fail to resolve
 * from a package's own `node_modules` otherwise, including test-only
 * imports (`@velachess/test-utils`, `@velachess/fixtures`) that aren't
 * always declared as real dependencies. `tsconfig.json`'s `paths` cover
 * the same names for type-checking; this is the runtime counterpart.
 */
export const aliases = {
  "@velachess/chess": path.resolve(import.meta.dirname, "./libs/chess"),
  "@velachess/engine": path.resolve(import.meta.dirname, "./libs/infra/engine"),
  "@velachess/fixtures": path.resolve(import.meta.dirname, "./libs/fixtures"),
  "@velachess/platforms": path.resolve(import.meta.dirname, "./libs/infra/platforms"),
  "@velachess/db": path.resolve(import.meta.dirname, "./libs/infra/db"),
  "@velachess/repertoire": path.resolve(import.meta.dirname, "./libs/repertoire"),
  "@velachess/analysis": path.resolve(import.meta.dirname, "./libs/analysis"),
  "@velachess/scheduler": path.resolve(import.meta.dirname, "./libs/scheduler"),
  "@velachess/queue": path.resolve(import.meta.dirname, "./libs/infra/queue"),
  "@velachess/application": path.resolve(import.meta.dirname, "./libs/application"),
  "@velachess/test-utils": path.resolve(import.meta.dirname, "./libs/test-utils"),
  "@velachess/ui": path.resolve(import.meta.dirname, "./libs/ui/src"),
  // Reached from __e2e__/, which belongs to neither app and so has no
  // package.json declaring these as real dependencies on its behalf.
  "@velachess/logger": path.resolve(import.meta.dirname, "./libs/infra/logger/src"),
  "@velachess/auth": path.resolve(import.meta.dirname, "./libs/infra/auth"),
};

/**
 * Every backend package (apps/server, apps/worker, libs/*) shares this:
 * node environment, the alias map above, and the 120s budget the db/
 * engine/e2e harnesses need to boot PGlite, run real migrations and start
 * Stockfish before the first assertion. `libs/ui` and `apps/web` are the
 * only projects that diverge — they need jsdom and their own transforms,
 * so they define their own `vitest.config.ts` from scratch instead of
 * extending this.
 */
export const backendTest = {
  environment: "node" as const,
  globals: true,
  hookTimeout: 120_000,
  testTimeout: 120_000,
};
