import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { renderApp } from "../../test/render.tsx";
import { server } from "../../test/server.ts";
import {
  emailIsUnverified,
  RESET_TOKEN,
  sessionInactive,
  signInMethodsAre,
  TEST_PASSWORD,
  TEST_USER,
} from "../../test/handlers/auth.ts";

describe("the way into a reset", () => {
  it("is offered on the sign-in screen only where the instance can send email", async () => {
    sessionInactive();
    await renderApp({ path: "/login" });
    await screen.findByRole("button", { name: "Sign in" });
    expect(screen.queryByRole("link", { name: "Forgot password?" })).toBeNull();
  });

  it("leads from the sign-in screen to the reset request", async () => {
    sessionInactive();
    signInMethodsAre({ passwordReset: true });
    const { user, router } = await renderApp({ path: "/login" });

    await user.click(await screen.findByRole("link", { name: "Forgot password?" }));

    expect(router.state.location.pathname).toBe("/forgot-password");
    expect(
      await screen.findByRole("button", { name: "Send reset link" }),
    ).toBeInTheDocument();
  });
});

describe("requesting a reset", () => {
  it("says a link is on its way, without saying whether the account exists", async () => {
    sessionInactive();
    const { user } = await renderApp({ path: "/forgot-password" });

    await user.type(await screen.findByLabelText("Email"), "someone@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
      await screen.findByText(
        "If an account exists for that email, a reset link is on its way.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("refuses an address that is not one, before asking the server", async () => {
    sessionInactive();
    const { user } = await renderApp({ path: "/forgot-password" });

    await user.type(await screen.findByLabelText("Email"), "not-an-address");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
      await screen.findByText("That doesn't look like an email address."),
    ).toBeInTheDocument();
  });

  it("tells an unreachable server apart from a sent link", async () => {
    sessionInactive();
    server.use(
      http.post("/api/auth/request-password-reset", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    const { user } = await renderApp({ path: "/forgot-password" });

    await user.type(await screen.findByLabelText("Email"), "someone@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
      await screen.findByText("Couldn't reach the server. Try again in a moment."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/a reset link is on its way/)).toBeNull();
  });
});

describe("choosing a new password", () => {
  it("sets it from the emailed link and points back to sign in", async () => {
    sessionInactive();
    const { user } = await renderApp({ path: `/reset-password?token=${RESET_TOKEN}` });

    await user.type(await screen.findByLabelText("New password"), "brand-new-password");
    await user.type(screen.getByLabelText("Confirm new password"), "brand-new-password");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(
      await screen.findByText("Your password was changed. Sign in with the new one."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("checks the two entries match and are long enough", async () => {
    sessionInactive();
    const { user } = await renderApp({ path: `/reset-password?token=${RESET_TOKEN}` });

    await user.type(await screen.findByLabelText("New password"), "short");
    await user.type(screen.getByLabelText("Confirm new password"), "different");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("Use at least 8 characters.")).toBeInTheDocument();
    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
  });

  it("explains an expired link and offers a new one", async () => {
    sessionInactive();
    const { user } = await renderApp({ path: "/reset-password?token=expired-token" });

    await user.type(await screen.findByLabelText("New password"), "brand-new-password");
    await user.type(screen.getByLabelText("Confirm new password"), "brand-new-password");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(
      await screen.findByText("This reset link is invalid or has expired."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("explains a link without a token instead of showing a form that cannot work", async () => {
    sessionInactive();
    await renderApp({ path: "/reset-password" });

    expect(
      await screen.findByText("This reset link is invalid or has expired."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).toBeNull();
  });
});

describe("an address that was never confirmed", () => {
  it("is told to check their inbox instead of that the password is wrong", async () => {
    sessionInactive();
    emailIsUnverified();
    const { user } = await renderApp({ path: "/login" });

    await user.type(await screen.findByLabelText("Email"), TEST_USER.email);
    await user.type(screen.getByLabelText("Password"), TEST_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText(
        "Confirm your email first. We sent a new link to your inbox.",
      ),
    ).toBeInTheDocument();
  });

  it("is told when the confirmation link it followed no longer works", async () => {
    sessionInactive();
    await renderApp({ path: "/login?error=INVALID_TOKEN" });

    expect(
      await screen.findByText(
        "That confirmation link is invalid or has expired. Sign in to get a new one.",
      ),
    ).toBeInTheDocument();
  });
});
