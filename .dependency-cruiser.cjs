const testPath = "(?:^|/)(?:tests|e2e)/|[.](?:test|spec)[.](?:[cm]?[jt]sx?)$";

const productionSource =
  "^(?:apps/(?:server|worker|web|site)/src|libs/(?:application|infra|chess|repertoire|analysis|scheduler|ui/src))/";

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
        path: "^libs/(?:application|infra|chess|repertoire|analysis|scheduler|ui/src)/",
        pathNot: testPath,
      },
      to: { path: "^apps/(?:server|worker|web|site)/" },
    },
    {
      name: "no-hono-outside-server",
      severity: "error",
      from: {
        path: "^libs/(?:application|infra|chess|repertoire|analysis|scheduler)/",
        pathNot: testPath,
      },
      to: { path: externalPackage("hono") },
    },
    {
      name: "application-uses-queue-port",
      severity: "error",
      from: { path: "^libs/application/", pathNot: testPath },
      to: {
        path: ["^libs/infra/queue/", externalPackage("pg-boss")],
        pathNot: "^libs/infra/queue/ports[.]ts$",
      },
    },
    {
      name: "no-infra-to-application",
      severity: "error",
      from: { path: "^libs/infra/", pathNot: testPath },
      to: { path: "^libs/application/" },
    },
    {
      name: "domain-stays-pure",
      severity: "error",
      from: {
        path: "^libs/(?:chess|repertoire|analysis|scheduler)/",
        pathNot: testPath,
      },
      to: {
        path: "^libs/(?:infra/(?:db|queue|auth)|application)/",
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
      severity: "error",
      from: { path: "^apps/worker/src/", pathNot: testPath },
      to: { path: "^libs/(?:analysis|repertoire|chess)/" },
    },
    {
      name: "no-cross-slice-imports",
      severity: "error",
      from: {
        path: "^libs/application/([^/]+/[^/]+)/",
        pathNot: testPath,
      },
      to: {
        path: "^libs/application/[^/]+/[^/]+/",
        pathNot: [
          "^libs/application/$1/",
          "^libs/application/(?:drills/seed-exercises|accounts/sync-account|games/judge-games|analysis/request-analysis|analysis/process-analysis|repertoires/get-repertoire|repertoires/list-repertoires|repertoires/extract-repertoire)/",
        ],
      },
    },
    {
      name: "better-auth-stays-at-auth-boundary",
      severity: "error",
      from: {
        path: [
          "^libs/application/(?!auth/)",
          "^libs/(?:chess|repertoire|analysis|scheduler)/",
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
          "^libs/(?:application|repertoire|analysis|scheduler|infra/queue|chess)/",
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
