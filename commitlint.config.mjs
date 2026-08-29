/**
 * Conventional Commits, enforced on the message and nowhere else.
 *
 * The history before this file is prose ("Pave the roles, not the
 * workflow"), so `git log` reads in two voices for a while. That is the
 * cost of the convention, paid once, and it buys automated changelogs and
 * version inference later.
 *
 * Bypass when you must: LEFTHOOK=0 git commit
 */

/** Workspaces double as scopes, so a scope is checkable rather than folklore. */
const scopes = [
  "api",
  "site",
  "web",
  "worker",
  "analysis",
  "application",
  "chess",
  "db",
  "engine",
  "fixtures",
  "ingest",
  "logger",
  "queue",
  "repertoire",
  "scheduler",
  "test-utils",
  "drill",
  "ui",
  // Cross-cutting, so they are not workspaces:
  "agents", // roles, skills, AGENTS.md
  "docs",
  "ci",
  "deps",
  "deps-dev", // Dependabot's scope for devDependencies
  "repo", // tooling and config that belongs to no package
];

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Empty scope stays legal: a change that touches five packages has no
    // honest single scope, and forcing one produces noise.
    "scope-enum": [2, "always", scopes],

    // Long enough for a real sentence, short enough to read in a log.
    "subject-max-length": [2, "always", 72],
    "header-max-length": [2, "always", 88],

    // The body is where the reasoning goes, and this repo writes it.
    "body-max-line-length": [2, "always", 76],
  },
};
