import { gameSourceSchema } from "@velachess/infra-platforms";
import { describe, expect, it } from "vitest";

import { gameSourceEnum } from "@velachess/infra-db";

describe("gameSourceEnum", () => {
  it("matches packages/ingest's gameSourceSchema exactly", () => {
    expect(gameSourceEnum.enumValues).toEqual(gameSourceSchema.options);
  });
});
