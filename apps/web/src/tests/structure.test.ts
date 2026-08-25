// @vitest-environment node
import { globSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../../..");

it("does not create technical bucket directories", () => {
  const buckets = globSync("apps/web/src/**/*.{ts,tsx}", { cwd: root }).filter((file) =>
    /apps\/web\/src\/(?:[^/]+\/)*(?:components|hooks|stores|services|helpers|utils)\//.test(
      file,
    ),
  );

  expect(buckets).toEqual([]);
});
