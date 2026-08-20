import { describe, expect, it } from "vitest";

import { IMPORT_SOURCES, INPUT_KINDS, SOURCE_IDS, SOURCE_ORDER } from "../sources.ts";

/** Stands in for the active locale: renders a descriptor's source text. */
const translate = (message: { message?: string; id: string }) =>
  message.message ?? message.id;

describe("the source catalogue", () => {
  it("offers every declared source, in a fixed order", () => {
    // The form renders off SOURCE_ORDER; a source missing from it would be
    // declared and invisible.
    expect([...SOURCE_ORDER].toSorted()).toEqual(Object.keys(IMPORT_SOURCES).toSorted());
  });

  it("uses the ids the API already speaks, so nothing is translated on the way out", () => {
    expect(SOURCE_IDS.chessCom).toBe("chess_com");
    expect(SOURCE_IDS.lichess).toBe("lichess");
  });

  it("gives every source what the form needs to render and validate it", () => {
    for (const id of SOURCE_ORDER) {
      const source = IMPORT_SOURCES[id];
      expect(source.id).toBe(id);
      expect(source.inputKind).toBe(INPUT_KINDS.username);
      expect(source.icon).toBeDefined();
      expect(source.buildSchema(translate)).toBeDefined();
    }
  });
});

describe("username validation", () => {
  const schema = IMPORT_SOURCES.chess_com.buildSchema(translate);
  const parse = (value: string) => schema.safeParse(value);

  it("accepts what both platforms accept", () => {
    for (const username of ["yurimutti", "Magnus_C", "a-b-c", "player2024"]) {
      expect(parse(username).success, username).toBe(true);
    }
  });

  it("trims before judging, so a pasted username with spaces still works", () => {
    const result = parse("  yurimutti  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("yurimutti");
  });

  it("rejects what would only fail later at the API", () => {
    for (const bad of ["", "   ", "yuri mutti", "yuri@mutti", "a".repeat(65)]) {
      expect(parse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("explains the rejection in words the person can read", () => {
    // The message comes from the active locale, not from zod's default.
    const result = parse("yuri mutti");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Letters, numbers, hyphen and underscore only",
      );
    }
  });
});
