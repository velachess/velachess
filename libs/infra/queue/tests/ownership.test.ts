// @vitest-environment node
import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../../..");

it("keeps job consumption in the worker", () => {
  const consumers = globSync(["libs/**/*.ts", "apps/server/**/*.ts"], {
    cwd: root,
  })
    .filter((file) => !/(?:^|\/)(?:tests|e2e)\//.test(file))
    .filter((file) => !/[.](?:test|spec)[.]ts$/.test(file))
    .filter((file) => {
      const source = readFileSync(path.join(root, file), "utf8")
        .replaceAll(/\/\*[\s\S]*?\*\//g, "")
        .replaceAll(/\/\/.*$/gm, "");
      return /\bboss[.]work\s*[<(]/.test(source);
    });

  expect(consumers).toEqual([]);
});
