import { afterEach, describe, expect, it, vi } from "vitest";

import { createResendSender } from "../resend.ts";

const CONFIG = {
  apiKey: "re_test_0123456789",
  from: "VelaChess <no-reply@chess.example.com>",
};
const EMAIL = {
  to: "player@example.com",
  subject: "Reset your VelaChess password",
  html: "<p>hi</p>",
  text: "hi",
  idempotencyKey: "reset-password/abc",
};

/** The real SDK over a stubbed `fetch`: what is under test is how its
 * `{ data, error }` answer is read, so the SDK itself stays real. */
function resendAnswers(status: number, body: unknown) {
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createResendSender", () => {
  it("sends the rendered email from the configured sender, idempotently", async () => {
    const fetchMock = resendAnswers(200, { id: "email-id" });

    await createResendSender(CONFIG)(EMAIL);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.resend.com/emails");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${CONFIG.apiKey}`);
    expect(headers.get("idempotency-key")).toBe(EMAIL.idempotencyKey);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      from: CONFIG.from,
      to: EMAIL.to,
      subject: EMAIL.subject,
      html: EMAIL.html,
      text: EMAIL.text,
    });
  });

  it("throws when Resend refuses, keeping its error as the cause", async () => {
    resendAnswers(422, {
      name: "invalid_from_address",
      message: "Invalid `from` field.",
      statusCode: 422,
    });

    const sending = createResendSender(CONFIG)(EMAIL);

    await expect(sending).rejects.toThrow("invalid_from_address");
    await expect(sending).rejects.toMatchObject({
      cause: { name: "invalid_from_address", statusCode: 422 },
    });
  });
});
