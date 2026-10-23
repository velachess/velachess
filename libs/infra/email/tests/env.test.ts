import { describe, expect, it } from "vitest";

import { resolveEmailEnv } from "../env.ts";

const API_KEY = "re_test_0123456789";

describe("resolveEmailEnv", () => {
  it("is off when neither variable is set", () => {
    expect(resolveEmailEnv({})).toBeNull();
  });

  it("is off when compose passes both as empty strings", () => {
    expect(resolveEmailEnv({ RESEND_API_KEY: "", VELACHESS_EMAIL_FROM: " " })).toBeNull();
  });

  it("is on when both are set", () => {
    expect(
      resolveEmailEnv({
        RESEND_API_KEY: ` ${API_KEY} `,
        VELACHESS_EMAIL_FROM: "VelaChess <no-reply@chess.example.com>",
      }),
    ).toEqual({ apiKey: API_KEY, from: "VelaChess <no-reply@chess.example.com>" });
  });

  it("accepts a bare address as the sender", () => {
    expect(
      resolveEmailEnv({ RESEND_API_KEY: API_KEY, VELACHESS_EMAIL_FROM: "a@b.example" }),
    ).toEqual({ apiKey: API_KEY, from: "a@b.example" });
  });

  it.each([
    [{ RESEND_API_KEY: API_KEY }, "VELACHESS_EMAIL_FROM"],
    [{ VELACHESS_EMAIL_FROM: "a@b.example" }, "RESEND_API_KEY"],
  ])("refuses half a configuration, naming the missing variable", (env, missing) => {
    expect(() => resolveEmailEnv(env)).toThrow(`${missing} is required`);
  });

  it("refuses a sender that is not an address, without echoing the key", () => {
    let message = "";
    try {
      resolveEmailEnv({ RESEND_API_KEY: API_KEY, VELACHESS_EMAIL_FROM: "VelaChess" });
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain("VELACHESS_EMAIL_FROM");
    expect(message).not.toContain(API_KEY);
  });
});
