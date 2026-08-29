import { gameSourceSchema } from "@velachess/platforms";
import { describe, expect, it } from "vitest";

import { gameSourceEnum } from "@velachess/db";

describe("gameSourceEnum", () => {
  it("matches packages/ingest's gameSourceSchema exactly", () => {
    expect(gameSourceEnum.enumValues).toEqual(gameSourceSchema.options);
  });
});
