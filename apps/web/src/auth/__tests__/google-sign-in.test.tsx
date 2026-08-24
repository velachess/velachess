import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { renderApp } from "../../test/render.tsx";
import { server } from "../../test/server.ts";
import {
  sessionInactive,
  signInMethodsAre,
  TEST_PASSWORD,
  TEST_USER,
} from "../../test/handlers/auth.ts";

/**
 * Signing in with Google, from the screen's side of the flow.
 *
 * The redirect itself is not testable here and should not be faked: jsdom
 * does not navigate, and a stubbed `location.assign` would prove only that
 * the stub was called. What the screen genuinely owns is everything around
 * the redirect — whether the button exists at all, what it asks the server
 * for, and what the person sees when they come back without a session.
 */

describe("the Google button", () => {
  it("is absent on an instance with no Google credentials", async () => {
    sessionInactive();
    // The default: `GET /config` reports google: false, as a self-host
    // without credentials does.
    await renderApp({ path: "/login" });

    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue with Google" }),
    ).not.toBeInTheDocument();
    // And the password form is untouched — the two methods are
    // independent, which is the whole reason the flag exists.
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("appears once the server says the provider is configured", async () => {
    sessionInactive();
    signInMethodsAre({ google: true });

    await renderApp({ path: "/login" });

    expect(
      await screen.findByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
    // Both methods, not one replacing the other.
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("never assumes the visitor is returning — Google is also the first door in", async () => {
    sessionInactive();
    signInMethodsAre({ google: true });

    await renderApp({ path: "/login" });

    // The provider button creates the account on first use (implicit
    // sign-up), so the copy stays neutral for both entry cases…
    expect(await screen.findByText("Continue to VelaChess")).toBeInTheDocument();
    expect(
      screen.getByText("Continue with Google or sign in with your account credentials."),
    ).toBeInTheDocument();
    // …and never promises an email registration that does not exist.
    expect(screen.queryByText(/sign up|create account/i)).not.toBeInTheDocument();
  });

  it("mentions only credentials on a password-only instance", async () => {
    sessionInactive();

    await renderApp({ path: "/login" });

    expect(await screen.findByText("Continue to VelaChess")).toBeInTheDocument();
    expect(
      screen.getByText("Sign in with your account credentials."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Google/)).not.toBeInTheDocument();
  });

  it("asks the server to start the flow, and never handles OAuth itself", async () => {
    sessionInactive();
    signInMethodsAre({ google: true });

    let body: Record<string, unknown> | undefined;
    server.use(
      http.post("/api/auth/sign-in/social", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ url: "https://accounts.google.com/o/oauth2/v2/auth" });
      }),
    );

    const { user } = await renderApp({ path: "/login?redirect=%2Fgames" });
    await user.click(await screen.findByRole("button", { name: "Continue with Google" }));

    await waitFor(() => expect(body).toBeDefined());
    // The provider, and where the person was headed — nothing else. No
    // client id, no scopes, no state: those are the server's, and a
    // client secret that reached this request would be a leak.
    expect(body).toMatchObject({ provider: "google", callbackURL: "/games" });
    expect(JSON.stringify(body)).not.toContain("secret");
    // The failure leg keeps the destination too: cancelling consent must
    // not cost the person where they were going.
    expect(body).toMatchObject({
      errorCallbackURL: "/login?redirect=%2Fgames",
    });
  });

  it("carries the interrupted destination through, like the password form does", async () => {
    sessionInactive();
    signInMethodsAre({ google: true });

    let body: Record<string, unknown> | undefined;
    server.use(
      http.post("/api/auth/sign-in/social", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ url: "https://accounts.google.com" });
      }),
    );

    const { user } = await renderApp({ path: "/login" });
    await user.click(await screen.findByRole("button", { name: "Continue with Google" }));

    // No `redirect` in the URL means the app's front door.
    await waitFor(() => expect(body).toMatchObject({ callbackURL: "/" }));
  });
});

describe("coming back from Google without a session", () => {
  it("says the attempt was cancelled when the person refused consent", async () => {
    sessionInactive();
    signInMethodsAre({ google: true });

    // `access_denied` is OAuth's own code for "the person said no".
    await renderApp({ path: "/login?error=access_denied" });

    expect(await screen.findByText("Google sign-in was cancelled.")).toBeInTheDocument();
  });

  it("says something went wrong for every other reason, without echoing the code", async () => {
    sessionInactive();
    signInMethodsAre({ google: true });

    await renderApp({ path: "/login?error=please_restart_the_process" });

    expect(
      await screen.findByText("Google sign-in didn't complete. Try again."),
    ).toBeInTheDocument();
    // The provider's code is written for a log, not for a person.
    expect(screen.queryByText(/please_restart_the_process/)).not.toBeInTheDocument();
  });

  it("still explains itself if the provider was switched off meanwhile", async () => {
    sessionInactive();
    // No Google button on this render — the error must not vanish with it,
    // or the person is back at a login screen with no idea why.
    await renderApp({ path: "/login?error=access_denied" });

    expect(await screen.findByText("Google sign-in was cancelled.")).toBeInTheDocument();
  });

  it("leaves the password form usable", async () => {
    sessionInactive();
    signInMethodsAre({ google: true });

    const { router, user } = await renderApp({ path: "/login?error=access_denied" });

    await user.type(screen.getByLabelText("Email"), TEST_USER.email);
    await user.type(screen.getByLabelText("Password"), TEST_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});

describe("when the sign-in-methods lookup fails", () => {
  it("still offers the method every instance has", async () => {
    sessionInactive();
    server.use(
      http.get("/api/config", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
    );

    await renderApp({ path: "/login" });

    // A login screen that renders nothing because a capability lookup
    // failed is worse than one that offers the password form.
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
});
