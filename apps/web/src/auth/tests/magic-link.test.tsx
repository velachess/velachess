import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import {
  magicLinkRefusedWith,
  sessionInactive,
  signInMethodsAre,
} from "../../test/handlers/auth.ts";
import { renderApp } from "../../test/render.tsx";
import { server } from "../../test/server.ts";

describe("the login screen shows only what the instance offers", () => {
  it("offers Google and an email link, and no password, when password sign-in is off", async () => {
    sessionInactive();
    signInMethodsAre({ password: false, google: true, magicLink: true });

    await renderApp({ path: "/login" });

    expect(
      await screen.findByRole("button", { name: "Email me a sign-in link" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Continue with Google or get a sign-in link by email."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /password instead/ }),
    ).not.toBeInTheDocument();
  });

  it("offers Google alone when it is the only method", async () => {
    sessionInactive();
    signInMethodsAre({ password: false, google: true });

    await renderApp({ path: "/login" });

    expect(
      await screen.findByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.queryByText("Or continue with")).not.toBeInTheDocument();
  });

  it("leads with the email link and keeps the password one click away when both are on", async () => {
    sessionInactive();
    signInMethodsAre({ magicLink: true });

    const { user } = await renderApp({ path: "/login" });

    await user.click(
      await screen.findByRole("button", { name: "Sign in with a password instead" }),
    );
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Email me a sign-in link" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Email me a sign-in link instead" }),
    );
    expect(
      screen.getByRole("button", { name: "Email me a sign-in link" }),
    ).toBeInTheDocument();
  });
});

describe("asking for a sign-in link", () => {
  it("sends the address and the destination, then says where the link went", async () => {
    sessionInactive();
    signInMethodsAre({ password: false, magicLink: true });

    let body: Record<string, unknown> | undefined;
    server.use(
      http.post<never, Record<string, unknown>>(
        "/api/auth/sign-in/magic-link",
        async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ status: true });
        },
      ),
    );

    const { user } = await renderApp({ path: "/login?redirect=%2Fgames" });
    await user.type(await screen.findByLabelText("Email"), " reader@example.com ");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    expect(
      await screen.findByText(
        "Check your inbox: we sent a sign-in link to reader@example.com. It works once and expires in 5 minutes.",
      ),
    ).toBeInTheDocument();
    expect(body).toEqual({
      email: "reader@example.com",
      callbackURL: "/games",
      errorCallbackURL: "/login?redirect=%2Fgames",
    });

    await user.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });

  it("checks the address before asking", async () => {
    sessionInactive();
    signInMethodsAre({ password: false, magicLink: true });

    const { user } = await renderApp({ path: "/login" });
    await user.click(
      await screen.findByRole("button", { name: "Email me a sign-in link" }),
    );

    expect(await screen.findByText("Enter your email.")).toBeInTheDocument();
  });

  it("says to wait when the server throttles", async () => {
    sessionInactive();
    signInMethodsAre({ password: false, magicLink: true });
    magicLinkRefusedWith(429);

    const { user } = await renderApp({ path: "/login" });
    await user.type(await screen.findByLabelText("Email"), "reader@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    expect(
      await screen.findByText("Too many links asked for. Wait a minute and try again."),
    ).toBeInTheDocument();
  });

  it("says the link was not sent when the server fails", async () => {
    sessionInactive();
    signInMethodsAre({ password: false, magicLink: true });
    magicLinkRefusedWith(500);

    const { user } = await renderApp({ path: "/login" });
    await user.type(await screen.findByLabelText("Email"), "reader@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    await waitFor(() =>
      expect(
        screen.getByText("Couldn't send the link. Try again in a moment."),
      ).toBeInTheDocument(),
    );
  });
});

describe("coming back from a link that no longer works", () => {
  it("says it is invalid or expired, and how to get a new one", async () => {
    sessionInactive();
    signInMethodsAre({ password: false, magicLink: true });

    await renderApp({ path: "/login?error=INVALID_TOKEN" });

    expect(
      await screen.findByText(
        "That link is invalid or has expired. Sign in to get a new one.",
      ),
    ).toBeInTheDocument();
  });
});
