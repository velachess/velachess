const testPath = "(?:^|/)(?:tests|e2e)/|[.](?:test|spec)[.](?:[cm]?[jt]sx?)$";

// The flat business-module libraries, one module per top-level folder
// under libs/ (see AGENTS.md "Modules and slices"). The former
// libs/application package these were migrated out of is gone as of
// migration phase 9.
const businessModules = "accounts|games|user|analysis";

const productionSource = `^(?:apps/(?:server|worker|web|site)/src|libs/(?:${businessModules}|infra|chess|ui/src))/`;

// apps/web verticals born from eliminating shared/ (see docs/explanation/apps/web.md).
// Only these expose an index.ts public surface; the remaining pre-existing
// verticals (auth, onboarding, settings, ...) predate the rule and are a
// deliberate, separate follow-up — see apps/web/AGENTS.md.
const webIndexOnlyVerticals = "api|backend-status|chess-sounds|query";

// The four capability domains inside apps/web/src/games, plus engine/ —
// the Stockfish infrastructure the domains run on — each with its own
// index.ts public surface (see docs/explanation/apps/web.md). `games/`
// itself holds nothing but these and two shared files.
const gamesDomains = "analysis|review|import|list|engine";

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
        path: `^libs/(?:${businessModules}|infra|chess|ui/src)/`,
        pathNot: testPath,
      },
      to: { path: "^apps/(?:server|worker|web|site)/" },
    },
    {
      name: "no-hono-outside-server",
      severity: "error",
      from: {
        path: `^libs/(?:${businessModules}|infra|chess)/`,
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
        path: "^libs/chess/",
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
        "A route must not execute shared domain behavior itself (e.g. converting an EPD to a FEN, parsing a PGN). That behavior belongs to the business-module slice that owns the use case; the route only maps the slice's result onto HTTP. Type-only references (e.g. a vocabulary type for a query schema) are unaffected. `analysis` dropped out once it became a business module (migration phase 7) — routes reaching its index.ts is the same intended pattern as every other business module, covered by routes-no-module-internals instead.",
      severity: "error",
      from: { path: "^apps/server/src/routes/", pathNot: testPath },
      to: {
        path: "^libs/chess/",
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
        pathNot: "^apps/web/src/api/index[.]ts$",
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
      from: { path: "^apps/web/src/api/index[.]ts$" },
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
        "A slice never imports a sibling slice's handler, same module or not — that's what a declared dependency + the composition root are for. Module-level pure-policy files live at the module root (e.g. libs/analysis/score.ts), one path segment up from any slice folder, so this pattern alone tells them apart from a slice's own files.",
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
          "^libs/(?:accounts|games|analysis)/",
          "^libs/chess/",
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
          `^libs/(?:infra/queue|chess|${businessModules})/`,
          externalPackage("hono"),
        ],
      },
    },
    {
      name: "area-contracts-stay-react-free",
      severity: "error",
      from: {
        path: "^apps/web/src/[^/]+/[^/]+[.]ts$",
        pathNot: [
          "^apps/web/src/(?:api|app-shell|backend-status|i18n|routes|test)/",
          testPath,
        ],
      },
      to: { path: [externalPackage("react"), externalPackage("react-dom")] },
    },
    {
      name: "web-vertical-index-only",
      comment:
        "A file outside api/, backend-status/, chess-sounds/, and query/ may only reach one of them through its index.ts — same shape as no-cross-module-deep-imports on the backend, scoped to the verticals this eliminates apps/web/src/shared/ into. The games domains have the same enforcement of their own, below; the remaining pre-existing verticals (auth, onboarding, settings, ...) are unaffected and retrofitting them is a separate follow-up.",
      severity: "error",
      from: {
        path: "^apps/web/src/",
        pathNot: [`^apps/web/src/(?:${webIndexOnlyVerticals})/`, testPath],
      },
      to: {
        path: `^apps/web/src/(?:${webIndexOnlyVerticals})/[^/]`,
        pathNot: `^apps/web/src/(?:${webIndexOnlyVerticals})/index[.]ts$`,
      },
    },
    {
      name: "web-vertical-no-cross-deep-imports",
      comment:
        "Same rule as web-vertical-index-only, for one of these verticals reaching a sibling's internals directly instead of through its index.ts.",
      severity: "error",
      from: {
        path: `^apps/web/src/(${webIndexOnlyVerticals})/`,
        pathNot: testPath,
      },
      to: {
        path: `^apps/web/src/(?:${webIndexOnlyVerticals})/[^/]`,
        pathNot: [
          `^apps/web/src/$1/`,
          `^apps/web/src/(?:${webIndexOnlyVerticals})/index[.]ts$`,
        ],
      },
    },
    {
      name: "games-domain-index-only",
      comment:
        "apps/web/src/games is four domains — analysis, review, import, list — plus engine, and a route, a sibling vertical or the test harness reaches one only through its index.ts. A domain's sub-slices (analysis/game, import/pgn, ...) are internal: their own index.ts is a contract toward the rest of their domain, not toward the app.",
      severity: "error",
      from: {
        path: "^apps/web/src/",
        pathNot: [`^apps/web/src/games/(?:${gamesDomains})/`, testPath],
      },
      to: {
        path: `^apps/web/src/games/(?:${gamesDomains})/[^/]`,
        pathNot: `^apps/web/src/games/(?:${gamesDomains})/index[.]ts$`,
      },
    },
    {
      name: "games-domain-no-cross-deep-imports",
      comment:
        "Same rule as games-domain-index-only, for one games domain reaching a sibling's internals instead of its index.ts. Inside its own domain a file imports directly, sub-slices included.",
      severity: "error",
      from: {
        path: `^apps/web/src/games/(${gamesDomains})/`,
        pathNot: testPath,
      },
      to: {
        path: `^apps/web/src/games/(?:${gamesDomains})/[^/]`,
        pathNot: [
          `^apps/web/src/games/$1/`,
          `^apps/web/src/games/(?:${gamesDomains})/index[.]ts$`,
        ],
      },
    },
    {
      name: "games-analysis-depends-on-no-sibling-domain",
      comment:
        "Analysis produces and reads evaluations and knows nothing about the screens that show them: Review consumes Analysis, never the other way round. Analysis is equally independent of import and list.",
      severity: "error",
      from: { path: "^apps/web/src/games/analysis/", pathNot: testPath },
      to: { path: "^apps/web/src/games/(?:review|import|list)/" },
    },
    {
      name: "games-engine-is-infrastructure",
      comment:
        "games/engine runs searches and knows nothing about what a score means or who is looking at one: it may not reach a games domain, @velachess/analysis, the router or a state library. React is already forbidden by games-domain-logic-stays-react-free.",
      severity: "error",
      from: { path: "^apps/web/src/games/engine/", pathNot: testPath },
      to: {
        path: [
          "^apps/web/src/games/(?:analysis|review|import|list)/",
          externalPackage("@velachess/analysis"),
          externalPackage("zustand"),
          externalPackage("@tanstack/react-router"),
          externalPackage("@tanstack/react-start"),
        ],
      },
    },
    {
      name: "games-domain-logic-stays-react-free",
      comment:
        "A .ts module inside a games domain is domain logic — a query, a store, a policy, a read model — and stays runnable without React; only a use-*.ts hook file reaches for it. A type-only import compiles away and does not count. The screens are .tsx, which this rule leaves alone.",
      severity: "error",
      from: {
        path: "^apps/web/src/games/.*[.]ts$",
        pathNot: ["(?:^|/)use-[^/]+[.]ts$", testPath],
      },
      to: {
        path: [externalPackage("react"), externalPackage("react-dom")],
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "web-facade-only-for-third-party-clients",
      comment:
        "zod, hono/client, @tanstack/react-query, event-source-plus, idb and effection are each wrapped once in apps/web/src/libs/* so a version bump or provider swap touches one file; every other file imports the wrapper, never the package directly.",
      severity: "error",
      from: { path: "^apps/web/src/", pathNot: ["^apps/web/src/libs/", testPath] },
      to: {
        path: [
          externalPackage("zod"),
          externalPackage("hono"),
          externalPackage("@tanstack/react-query"),
          externalPackage("event-source-plus"),
          externalPackage("idb"),
          externalPackage("effection"),
        ],
      },
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
