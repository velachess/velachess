// @vitest-environment node
import { globSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");

it("does not create technical bucket directories", () => {
  const buckets = globSync("apps/site/src/**/*.{ts,tsx}", { cwd: root }).filter((file) =>
    /apps\/site\/src\/(?:[^/]+\/)*(?:components|hooks|stores|services|helpers|utils)\//.test(
      file,
    ),
  );

  expect(buckets).toEqual([]);
});
