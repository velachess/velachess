const testPath = "(?:^|/)(?:tests|e2e)/|[.](?:test|spec)[.](?:[cm]?[jt]sx?)$";

// The flat business-module libraries, one module per top-level folder
// under libs/ (see AGENTS.md "Modules and slices"). The former
// libs/application package these were migrated out of is gone as of
// migration phase 9.
const businessModules =
  "accounts|games|repertoires|drills|insights|deviations|overview|auth|analysis";

const productionSource = `^(?:apps/(?:server|worker|web|site)/src|libs/(?:${businessModules}|infra|chess|scheduler|ui/src))/`;

function externalPackage(name) {
  return `(?:^${name}(?:/|$)|(?:^|/)node_modules/${name}(?:/|$))`;
}

function externalScope(scope) {
  return `(?:^${scope}/|(?:^|/)node_modules/${scope}/)`;
}

/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-libs-to-apps",
      severity: "error",
      from: {
        path: `^libs/(?:${businessModules}|infra|chess|scheduler|ui/src)/`,
        pathNot: testPath,
      },
      to: { path: "^apps/(?:server|worker|web|site)/" },
    },
    {
      name: "no-hono-outside-server",
      severity: "error",
      from: {
        path: `^libs/(?:${businessModules}|infra|chess|scheduler)/`,
        pathNot: testPath,
      },
      to: { path: externalPackage("hono") },
    },
    {
      name: "module-no-queue-object",
      comment:
        "A slice in this model never holds an AnalysisQueue/SyncQueue-typed field at all, not even via the ports type — it declares its own EnqueueX-shaped function type and the composition root (not the module) reaches libs/infra/queue, including ports.ts, to satisfy it.",
      severity: "error",
      from: { path: `^libs/(?:${businessModules})/`, pathNot: testPath },
      to: { path: ["^libs/infra/queue/", externalPackage("pg-boss")] },
    },
    {
      name: "no-infra-to-modules",
      severity: "error",
      from: { path: "^libs/infra/", pathNot: testPath },
      to: { path: `^libs/(?:${businessModules})/` },
    },
    {
      name: "domain-stays-pure",
      severity: "error",
      from: {
        path: "^libs/(?:chess|scheduler)/",
        pathNot: testPath,
      },
      to: {
        path: `^libs/(?:infra/(?:db|queue|auth)|${businessModules})/`,
      },
    },
    {
      name: "no-engine-in-server",
      severity: "error",
      from: { path: "^apps/server/src/" },
      to: {
        path: ["^libs/infra/engine/", externalPackage("stockfish")],
      },
    },
    {
      name: "routes-no-direct-infra",
      comment:
        "A route is transport wiring, not a data or queue client. Persistence, provider HTTP, and queue delivery belong to the business-module slice the route invokes (or to the composition root — deps.ts/main.ts/server.ts — for wiring). Intended flow: route -> module slice -> infra, never route -> infra directly.",
      severity: "error",
      from: { path: "^apps/server/src/routes/", pathNot: testPath },
      to: { path: "^libs/infra/" },
    },
    {
      name: "routes-no-direct-domain-behavior",
      comment:
        "A route must not execute shared domain behavior itself (e.g. converting an EPD to a FEN, building a repertoire tree, running scheduler math). That behavior belongs to the business-module slice that owns the use case; the route only maps the slice's result onto HTTP. Type-only references (e.g. a vocabulary type for a query schema) are unaffected. `analysis` dropped out once it became a business module (migration phase 7) — routes reaching its index.ts is the same intended pattern as every other business module, covered by routes-no-module-internals instead.",
      severity: "error",
      from: { path: "^apps/server/src/routes/", pathNot: testPath },
      to: {
        path: "^libs/(?:chess|scheduler)/",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "routes-no-module-internals",
      comment:
        "A route may only import a business module's index.ts, never a slice file inside it — same rule as routes-no-direct-infra, for the flat libs/<module> libraries.",
      severity: "error",
      from: { path: "^apps/server/src/routes/", pathNot: testPath },
      to: {
        path: `^libs/(?:${businessModules})/[^/]`,
        pathNot: `^libs/(?:${businessModules})/index[.]ts$`,
      },
    },
    {
      name: "worker-no-module-internals",
      comment:
        "Same as routes-no-module-internals, for worker consumers and main.ts — composition needs only a module's index.ts, never its slice internals.",
      severity: "error",
      from: { path: "^apps/worker/src/", pathNot: testPath },
      to: {
        path: `^libs/(?:${businessModules})/[^/]`,
        pathNot: `^libs/(?:${businessModules})/index[.]ts$`,
      },
    },
    {
      name: "composition-no-module-internals",
      comment:
        "The composition root builds adapters from index.ts + infra; it does not get a deeper exemption into module internals, because every cross-slice/cross-module need is satisfiable through index.ts by design.",
      severity: "error",
      from: { path: "^apps/server/src/composition/", pathNot: testPath },
      to: {
        path: `^libs/(?:${businessModules})/[^/]`,
        pathNot: `^libs/(?:${businessModules})/index[.]ts$`,
      },
    },
    {
      name: "no-cross-app-runtime-imports",
      severity: "error",
      from: { path: "^apps/([^/]+)/" },
      to: {
        path: "^apps/",
        pathNot: "^apps/$1/",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "no-cross-app-type-imports",
      severity: "error",
      from: {
        path: "^apps/([^/]+)/",
        pathNot: "^apps/web/src/shared/api/client[.]ts$",
      },
      to: {
        path: "^apps/",
        pathNot: "^apps/$1/",
        dependencyTypes: ["type-only"],
      },
    },
    {
      name: "web-uses-only-server-api-contract",
      severity: "error",
      from: { path: "^apps/web/src/shared/api/client[.]ts$" },
      to: {
        path: "^apps/(?!web/)",
        pathNot: "^apps/server/src/server[.]ts$",
        dependencyTypes: ["type-only"],
      },
    },
    {
      name: "worker-consumers-stay-thin",
      comment:
        "`analysis` dropped out once it became a business module (migration phase 7) — a worker consumer calling its index.ts is the same intended pattern as accounts's consumer calling @velachess/accounts, not a bypass of module behavior.",
      severity: "error",
      from: { path: "^apps/worker/src/", pathNot: testPath },
      to: { path: "^libs/chess/" },
    },
    {
      name: "no-cross-module-deep-imports",
      comment:
        "Module A must never deep-import module B's internals — only B's index.ts. No composition-root exemption: every wiring need is satisfiable through index.ts.",
      severity: "error",
      from: { path: `^libs/(${businessModules})/`, pathNot: testPath },
      to: {
        path: `^libs/(?:${businessModules})/[^/]`,
        pathNot: [`^libs/$1/`, `^libs/(?:${businessModules})/index[.]ts$`],
      },
    },
    {
      name: "no-intra-module-slice-imports",
      comment:
        "A slice never imports a sibling slice's handler, same module or not — that's what a declared dependency + the composition root are for. Module-level pure-policy files live at the module root (e.g. libs/repertoires/tree.ts), one path segment up from any slice folder, so this pattern alone tells them apart from a slice's own files.",
      severity: "error",
      from: {
        path: `^libs/(${businessModules})/([^/]+)/`,
        pathNot: testPath,
      },
      to: {
        path: `^libs/(?:${businessModules})/[^/]+/[^/]+/`,
        pathNot: [`^libs/$1/$2/`, `^libs/(?:${businessModules})/[^/]+/index[.]ts$`],
      },
    },
    {
      name: "better-auth-stays-at-auth-boundary",
      severity: "error",
      from: {
        path: [
          "^libs/(?:accounts|games|repertoires|analysis|drills|insights|deviations|overview)/",
          "^libs/(?:chess|scheduler)/",
          "^libs/infra/db/",
          "^apps/worker/src/",
        ],
        pathNot: testPath,
      },
      to: {
        path: [
          "^libs/infra/auth/",
          externalPackage("better-auth"),
          externalScope("@better-auth"),
        ],
      },
    },
    {
      name: "auth-stays-identity-only",
      severity: "error",
      from: { path: "^libs/infra/auth/", pathNot: testPath },
      to: {
        path: [
          `^libs/(?:scheduler|infra/queue|chess|${businessModules})/`,
          externalPackage("hono"),
        ],
      },
    },
    {
      name: "area-contracts-stay-react-free",
      severity: "error",
      from: {
        path: "^apps/web/src/[^/]+/[^/]+[.]ts$",
        pathNot: ["^apps/web/src/(?:api|app-shell|i18n|routes|test)/", testPath],
      },
      to: { path: [externalPackage("react"), externalPackage("react-dom")] },
    },
    {
      name: "no-circular-dependencies",
      severity: "error",
      from: { path: productionSource, pathNot: testPath },
      to: {
        circular: true,
        dependencyTypesNot: ["type-only"],
        viaOnly: { dependencyTypesNot: ["type-only"] },
      },
    },
  ],
  options: {
    doNotFollow: { path: "^node_modules" },
    exclude: {
      path: "(?:^|/)(?:dist|out|coverage|[.]next)(?:/|$)",
    },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
  },
};
