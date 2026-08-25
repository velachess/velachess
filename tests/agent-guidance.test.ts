// @vitest-environment node
/** Mechanical skill shape belongs in the build; prose review owns whether a skill is useful. */
import {
  existsSync,
  globSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const SKILL_GLOBS = [
  ".agents/skills/*/SKILL.md",
  "apps/*/.agents/skills/*/SKILL.md",
  "libs/*/.agents/skills/*/SKILL.md",
] as const;

function filesOf(...patterns: string[]): string[] {
  return patterns.flatMap((pattern) => globSync(pattern, { cwd: root })).toSorted();
}

function metadataOf(file: string): { name: string; description: string } {
  const text = readFileSync(path.join(root, file), "utf8");
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const name = frontmatter?.[1]?.match(/^name:\s*([^\r\n]+)$/m)?.[1]?.trim();
  const description = frontmatter?.[1]
    ?.match(/^description:\s*([^\r\n]+)$/m)?.[1]
    ?.trim();
  if (!name || !description) {
    throw new Error(`${file} needs name and description frontmatter`);
  }
  return { name, description };
}

describe("agent guidance", () => {
  const skillFiles = filesOf(...SKILL_GLOBS);

  it("keeps skill folders, names, and descriptions routable", () => {
    const metadata = skillFiles.map((file) => ({ file, ...metadataOf(file) }));

    expect(metadata).not.toHaveLength(0);
    expect(new Set(metadata.map(({ name }) => name)).size).toBe(metadata.length);

    for (const { file, name, description } of metadata) {
      expect(name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(path.basename(path.dirname(file))).toBe(name);
      expect(description).not.toBe("");
    }
  });

  it("resolves every local link in skill markdown", () => {
    const markdown = filesOf(
      ".agents/skills/**/*.md",
      "apps/*/.agents/skills/**/*.md",
      "libs/*/.agents/skills/**/*.md",
    );
    const missing = markdown.flatMap((file) => {
      const text = readFileSync(path.join(root, file), "utf8");
      return [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)]
        .map((match) => match[1]!)
        .filter((target) => !/^(?:https?:|#)/.test(target))
        .map((target) => target.split("#", 1)[0]!)
        .filter((target) => !existsSync(path.resolve(root, path.dirname(file), target)))
        .map((target) => `${file} -> ${target}`);
    });

    expect(missing).toEqual([]);
  });

  it("keeps shared vendor entries as complete relative-symlink adapters", () => {
    const shared = skillFiles
      .filter((file) => file.startsWith(".agents/skills/"))
      .map((file) => path.basename(path.dirname(file)))
      .toSorted();

    for (const vendor of [".claude", ".cursor"]) {
      const entries = filesOf(`${vendor}/skills/*`);
      expect(entries.map((entry) => path.basename(entry))).toEqual(shared);

      for (const entry of entries) {
        const absolute = path.join(root, entry);
        const name = path.basename(entry);
        expect(lstatSync(absolute).isSymbolicLink()).toBe(true);
        expect(readlinkSync(absolute)).toBe(`../../.agents/skills/${name}`);
        expect(realpathSync(absolute)).toBe(
          realpathSync(path.join(root, ".agents/skills", name)),
        );
      }
    }
  });
});
