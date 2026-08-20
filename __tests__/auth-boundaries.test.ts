// @vitest-environment node
/**
 * The auth boundary, as failures instead of prose.
 *
 * Authentication answers one question — who is making this request — and
 * everything downstream receives a userId. The moment a domain package
 * imports Better Auth, authorization decisions start hiding inside code
 * that cannot be tested without a session, and the single seam that made
 * this refactor cheap is gone. A comment saying so is a hope; this file
 * is the thing that says no.
 *
 * Source text, not a module graph, on purpose: `import type` disappears
 * at runtime and a graph would call it harmless — but a type-only import
 * is exactly the drift worth catching, because the next edit drops the
 * `type`.
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

/** Every module specifier a file imports or re-exports. */
function importsOf(text: string): string[] {
  return [...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(
    (match) => match[1]!,
  );
}

function offenders(
  sources: { file: string; text: string }[],
  forbidden: (specifier: string) => boolean,
): string[] {
  return sources
    .filter(({ file }) => !file.includes("/tests/") && !file.endsWith(".test.ts"))
    .flatMap(({ file, text }) =>
      importsOf(text)
        .filter(forbidden)
        .map((specifier) => `${file} → ${specifier}`),
    );
}

describe("auth boundaries", () => {
  it("keeps Better Auth out of application and the domain packages", () => {
    // The application layer receives userId from the API middleware and
    // never learns where it came from — that indirection is what lets the
    // worker resolve identity from a trusted row instead, and what keeps
    // every domain rule testable without a session.
    //
    // One carve-out, by design: libs/application/auth/** is the
    // application face OF the identity mechanism — bootstrap provisions
    // the first admin through Better Auth's own API, which is the whole
    // point of that slice. The rule protects games, drills, repertoires
    // and the worker from knowing Better Auth; it does not pretend the
    // auth slices can be written without it.
    const sources = sourcesOf(
      "libs/application/**/*.ts",
      "libs/chess/**/*.ts",
      "libs/repertoire/**/*.ts",
      "libs/analysis/**/*.ts",

      "libs/scheduler/**/*.ts",
      "libs/infra/db/**/*.ts",
      "apps/worker/src/**/*.ts",
    );

    const outsideAuthSlices = sources.filter(
      ({ file }) => !file.startsWith("libs/application/auth/"),
    );

    expect(
      offenders(outsideAuthSlices, (specifier) =>
        ["@velachess/auth", "better-auth", "@better-auth/"].some((banned) =>
          specifier.startsWith(banned),
        ),
      ),
    ).toEqual([]);
  });

  it("keeps the auth package out of the domain — it may know db, nothing else", () => {
    // libs/auth owns "who is this" and its storage. The day it
    // imports repertoire or drill, authorization has moved into it.
    const sources = sourcesOf("libs/infra/auth/**/*.ts");

    expect(
      offenders(sources, (specifier) =>
        [
          "@velachess/application",
          "@velachess/repertoire",
          "@velachess/drill",
          "@velachess/analysis",
          "@velachess/scheduler",
          "@velachess/queue",
          "@velachess/chess",
          "hono",
        ].some((banned) => specifier.startsWith(banned)),
      ),
    ).toEqual([]);
  });
});
