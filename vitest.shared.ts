import path from "node:path";

/**
 * The one place a workspace's `@velachess/*` specifier is registered for
 * tests. pnpm's strict linking means an app or library sees only the workspace
 * dependencies it declares — bare `@velachess/x` imports fail to resolve
 * from its own `node_modules` otherwise, including test-only
 * imports (`@velachess/test-utils`, `@velachess/fixtures`) that aren't
 * always declared as real dependencies. `tsconfig.json`'s `paths` cover
 * the same names for type-checking; this is the runtime counterpart.
 */
export const aliases = {
  "@velachess/chess": path.resolve(import.meta.dirname, "./libs/chess"),
  "@velachess/infra-engine": path.resolve(import.meta.dirname, "./libs/infra/engine"),
  "@velachess/fixtures": path.resolve(import.meta.dirname, "./libs/fixtures"),
  "@velachess/infra-platforms": path.resolve(
    import.meta.dirname,
    "./libs/infra/platforms",
  ),
  "@velachess/infra-db": path.resolve(import.meta.dirname, "./libs/infra/db"),
  "@velachess/analysis": path.resolve(import.meta.dirname, "./libs/analysis"),
  "@velachess/scheduler": path.resolve(import.meta.dirname, "./libs/scheduler"),
  "@velachess/infra-queue": path.resolve(import.meta.dirname, "./libs/infra/queue"),
  "@velachess/test-utils": path.resolve(import.meta.dirname, "./libs/test-utils"),
  "@velachess/ui": path.resolve(import.meta.dirname, "./libs/ui/src"),
  // Reached from e2e/, which belongs to neither app and so has no
  // package.json declaring these as real dependencies on its behalf.
  "@velachess/infra-logger": path.resolve(import.meta.dirname, "./libs/infra/logger/src"),
  "@velachess/infra-auth": path.resolve(import.meta.dirname, "./libs/infra/auth"),
};

/**
 * Every backend app/library (apps/server, apps/worker, libs/*) shares this:
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
