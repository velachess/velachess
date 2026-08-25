// @vitest-environment node
import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../../..");

it("owns app theme declarations and the public site's shared fonts", () => {
  const appThemes = globSync("apps/**/*.css", { cwd: root }).filter((file) =>
    readFileSync(path.join(root, file), "utf8").includes("@theme"),
  );
  const siteFonts = globSync("apps/site/{src,public}/**/*.{otf,ttf,woff,woff2}", {
    cwd: root,
  });

  expect(appThemes).toEqual([]);
  expect(siteFonts).toEqual([]);
});
