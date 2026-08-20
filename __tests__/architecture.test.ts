// @vitest-environment node
/**
 * The architecture, as failures instead of prose.
 *
 * docs/explanation/architecture.md says what the boundaries are and why;
 * this file is the thing that says no. Every rule here was written down
 * somewhere first and held only until the first person who did not read
 * it — a comment is a hope, a failing build is a decision.
 *
 * They read source text rather than a module graph on purpose: a
 * type-only import disappears at runtime, so a graph would call it
 * harmless — but `import type { X } from "hono"` in a slice is exactly
 * the drift worth catching, because the next edit drops the `type`.
 */
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

function sourcesOf(...globs: string[]): { file: string; text: string }[] {
  return globs
    .flatMap((pattern) =>
      globSync(pattern, { cwd: root, exclude: (name) => name === "node_modules" }),
    )
    .filter((file) => /\.tsx?$/.test(file) && !file.includes("node_modules"))
    .map((file) => ({ file, text: readFileSync(path.join(root, file), "utf8") }));
}

/** Source with comments removed — for rules about what code *does*,
 * where prose describing the forbidden thing is not the forbidden thing.
 * Import rules deliberately do NOT use this: a commented-out import is
 * usually one line from coming back. */
function withoutComments(text: string): string {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/\/\/.*$/gm, "");
}

/** Every module specifier a file imports or re-exports. */
function importsOf(text: string): string[] {
  return [...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(
    (match) => match[1]!,
  );
}

function offenders(
  sources: { file: string; text: string }[],
  forbidden: (specifier: string, file: string) => boolean,
): string[] {
  return sources
    .filter(
      ({ file }) =>
        !file.includes("/__tests__/") &&
        !file.includes("/__e2e__/") &&
        !file.endsWith(".test.ts"),
    )
    .flatMap(({ file, text }) =>
      importsOf(text)
        .filter((specifier) => forbidden(specifier, file))
        .map((specifier) => `${file} → ${specifier}`),
    );
}

const application = sourcesOf("libs/application/**/*.ts");
const infra = sourcesOf("libs/infra/**/*.ts");
const domain = sourcesOf(
  "libs/chess/**/*.ts",
  "libs/repertoire/**/*.ts",
  "libs/analysis/**/*.ts",
  "libs/scheduler/**/*.ts",
);
const everyLib = [
  ...application,
  ...infra,
  ...domain,
  ...sourcesOf("libs/ui/src/**/*.ts", "libs/ui/src/**/*.tsx"),
];

describe("monorepo direction", () => {
  it("keeps every lib ignorant of the apps", () => {
    // apps compose libs; a lib that imports an app has inverted the
    // repository. This is the one rule the brief calls non-negotiable.
    expect(
      offenders(
        everyLib,
        (specifier) =>
          ["@velachess/server", "@velachess/worker", "@velachess/web"].some((app) =>
            specifier.startsWith(app),
          ) ||
          specifier.includes("apps/server") ||
          specifier.includes("apps/worker") ||
          specifier.includes("apps/web"),
      ),
    ).toEqual([]);
  });

  it("keeps HTTP out of everything that is not the server", () => {
    // Transports belong to the composition roots. A slice that imports
    // hono has started becoming a controller.
    expect(
      offenders(
        [...application, ...infra, ...domain],
        (specifier) => specifier === "hono" || specifier.startsWith("hono/"),
      ),
    ).toEqual([]);
  });

  it("keeps pg-boss out of application, ports and all", () => {
    // The queue package index re-exports the pg-boss client and adapter,
    // so depending on `@velachess/queue` reaches them even when only the
    // contract is wanted. `@velachess/queue/ports` is the contract.
    expect(
      offenders(
        application,
        (specifier) =>
          specifier === "pg-boss" ||
          (specifier.startsWith("@velachess/queue") &&
            specifier !== "@velachess/queue/ports"),
      ),
    ).toEqual([]);
  });

  it("keeps infra free of application behavior", () => {
    // db, queue, providers, auth answer "what mechanisms exist", never
    // "what does the system do". An infra module importing a slice turns
    // every mechanism into a use case.
    expect(
      offenders(infra, (specifier) => specifier.startsWith("@velachess/application")),
    ).toEqual([]);
  });

  it("keeps the domain libraries pure", () => {
    // Rules exercisable without a database, a queue or a request.
    // @velachess/engine is allowed in analysis: it is the port the
    // grading rules are written against, and it is already an adapter.
    expect(
      offenders(domain, (specifier) =>
        [
          "@velachess/db",
          "@velachess/queue",
          "@velachess/application",
          "@velachess/auth",
        ].some((banned) => specifier.startsWith(banned)),
      ),
    ).toEqual([]);
  });

  it("keeps the server free of the engine", () => {
    // Analysis executes in the worker (or behind the process lock); the
    // API that can start Stockfish in a request eventually will.
    expect(
      offenders(sourcesOf("apps/server/src/**/*.ts"), (specifier) =>
        ["@velachess/engine", "stockfish"].some((banned) => specifier.startsWith(banned)),
      ),
    ).toEqual([]);
  });

  it("keeps the two deployables apart", () => {
    // api and worker are two processes from one image. Either importing
    // the other makes them a single deployable that happens to start
    // twice — and the direction that tempts is server → worker, to reach
    // the consumers. A test that needs both composes them at the repo
    // root (__e2e__/), where belonging to neither is the point.
    //
    // Test files are included here, unlike every other rule in this
    // file: the violation this was written for lived in apps/server/__e2e__.
    const crossing = (app: "server" | "worker") => {
      const other = app === "server" ? "worker" : "server";
      return sourcesOf(`apps/${app}/**/*.ts`).flatMap(({ file, text }) =>
        importsOf(text)
          .filter(
            (specifier) =>
              specifier.includes(`apps/${other}`) ||
              specifier.includes(`../${other}/`) ||
              specifier.startsWith(`@velachess/${other}`),
          )
          .map((specifier) => `${file} → ${specifier}`),
      );
    };

    expect([...crossing("server"), ...crossing("worker")]).toEqual([]);
  });

  it("keeps job consumption in the worker", () => {
    // Sending is a producer's business and both apps do it. *Consuming* —
    // registering a handler, choosing concurrency — is what makes a
    // process the worker, so a library that grows a `boss.work` has
    // quietly become a second worker nobody deploys. Queue creation and
    // the send adapters stay shared; this is the line between them.
    const consuming = sourcesOf("libs/**/*.ts", "apps/server/**/*.ts")
      .filter(
        ({ file }) =>
          !file.includes("/__tests__/") &&
          !file.includes("/__e2e__/") &&
          !file.endsWith(".test.ts"),
      )
      // Comments stripped first: queues.ts *explains* boss.work's
      // heartbeat behaviour, and a rule that punishes the explanation
      // teaches people to delete comments.
      .filter(({ text }) => /\bboss\.work\s*[<(]/.test(withoutComments(text)))
      .map(({ file }) => file);

    expect(consuming).toEqual([]);
  });

  it("keeps worker consumers thin", () => {
    // A consumer unpacks a payload and calls one slice. The moment it
    // imports a domain package it has started implementing one.
    expect(
      offenders(sourcesOf("apps/worker/src/**/*.ts"), (specifier) =>
        ["@velachess/analysis", "@velachess/repertoire", "@velachess/chess"].some(
          (banned) => specifier.startsWith(banned),
        ),
      ),
    ).toEqual([]);
  });
});

describe("slice coupling", () => {
  /**
   * A slice imports its own files, infra, domain libs — and not its
   * neighbours. The allowlist is the set of documented exceptions in
   * docs/explanation/architecture.md; adding to it is an architecture
   * decision, not a convenience.
   */
  const CROSS_SLICE_ALLOWED = new Set([
    // seeding is one behavior with three triggers
    "drills/seed-exercises",
    // one refresh behavior, two entry points (HTTP + worker core)
    "accounts/sync-account",
    // judging is invoked by sync (judgment follows sync, one use case)
    "games/judge-games",
    // watch composes over request-analysis' state read
    "analysis/request-analysis",
    // get-analysis reports what process-analysis would seed
    "analysis/process-analysis",
    // add-chapter guards through get-repertoire's scoped read
    "repertoires/get-repertoire",
    // insights reads the same rollup list-repertoires serves
    "repertoires/list-repertoires",
    // repertoires are derived from games, so the sync pipeline (and the
    // first import, which is a sync) grows the candidate books — one
    // behavior, triggered where the games land
    "repertoires/extract-repertoire",
  ]);

  it("keeps slices from importing other slices, outside the allowlist", () => {
    const sliceOf = (file: string) => {
      const m = file.match(/^libs\/application\/([^/]+\/[^/]+)\//);
      return m ? m[1] : null;
    };

    const bad = application
      .filter(({ file }) => !file.endsWith(".test.ts"))
      .flatMap(({ file, text }) => {
        const self = sliceOf(file);
        return importsOf(text)
          .map((spec) => {
            // resolve both deep-package and relative imports to a slice path
            const viaPkg = spec.match(/^@velachess\/application\/([^/]+\/[^/]+)/);
            if (viaPkg) return viaPkg[1];
            if (spec.startsWith(".")) {
              const resolved = path
                .normalize(path.join(path.dirname(file), spec))
                .replaceAll("\\", "/");
              const m = resolved.match(/^libs\/application\/([^/]+\/[^/]+)\//);
              return m ? m[1] : null;
            }
            return null;
          })
          .filter((target): target is string => Boolean(target))
          .filter((target) => target !== self && !CROSS_SLICE_ALLOWED.has(target))
          .map((target) => `${file} → ${target}`);
      });

    expect(bad).toEqual([]);
  });
});

describe("no resurrected layers", () => {
  it("rejects the vocabulary of layered architecture", () => {
    // A directory called services/ or repositories/ inside application
    // is the old architecture growing back. Files are checked by path,
    // so the failure names the offender.
    const layered = application
      .map(({ file }) => file)
      .filter((file) =>
        /libs\/application\/(?:[^/]+\/)*(controllers?|services?|repositories|use-cases|validators|mappers|entities)\//.test(
          file,
        ),
      );
    expect(layered).toEqual([]);
  });
});

describe("frontend slices", () => {
  const web = sourcesOf("apps/web/src/**/*.ts", "apps/web/src/**/*.tsx");

  it("rejects technical bucket directories in apps/web/src", () => {
    // The frontend's unit is a behavior inside an area, never a pile of
    // same-shaped files. A components/ or hooks/ directory is the layered
    // architecture growing back with React vocabulary; primitives belong
    // to libs/ui, behavior to its slice.
    const buckets = web
      .map(({ file }) => file)
      .filter((file) =>
        /apps\/web\/src\/(?:[^/]+\/)*(components|hooks|stores|services|helpers|utils)\//.test(
          file,
        ),
      );
    expect(buckets).toEqual([]);
  });

  it("keeps area-shared .ts modules free of react", () => {
    // A plain .ts directly under an area (games/analysis-contract.ts,
    // games/analysis-read.ts) is shared by that area's behaviors — the
    // frontend counterpart of db's multi-consumer queries. It must stay
    // a contract: schemas, fetches, pure derivations. The moment one
    // imports react it has become a component hiding from its slice —
    // components are .tsx, and belong to a behavior directory. Area-level
    // screens (.tsx) are legitimate until change pressure slices them.
    const infrastructure = new Set(["api", "app-shell", "i18n", "routes", "test"]);
    const areaShared = web.filter(({ file }) => {
      const m = file.match(/^apps\/web\/src\/([^/]+)\/[^/]+\.ts$/);
      return Boolean(m && !infrastructure.has(m[1]!) && !file.endsWith(".test.ts"));
    });
    expect(
      offenders(
        areaShared,
        (specifier) => specifier === "react" || specifier === "react-dom",
      ),
    ).toEqual([]);
  });
});
