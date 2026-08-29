// @vitest-environment node
import { globSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");

it("does not rebuild horizontal layers inside application", () => {
  const layered = globSync("libs/application/**/*.{ts,tsx}", { cwd: root }).filter(
    (file) =>
      /libs\/application\/(?:[^/]+\/)*(?:controllers?|services?|repositories|use-cases|validators|mappers|entities)\//.test(
        file,
      ),
  );

  expect(layered).toEqual([]);
});
