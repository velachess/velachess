import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";

import { desktopNav, renderApp } from "../../test/render.tsx";
import { server } from "../../test/server.ts";
import { deviceHasImported, resetDevice } from "../../test/device.ts";
import {
  sessionActive,
  sessionInactive,
  sessionUnavailable,
  TEST_PASSWORD,
  TEST_USER,
} from "../../test/handlers/auth.ts";

/**
 * Every test drives the real screens through the real router: the guard is
 * `_app`'s, the session comes from the HTTP contract the API publishes, and
 * nothing is stubbed below the network. What a
 * test controls is what the *server* believes — `sessionActive()` /
 * `sessionInactive()` — never what the app remembers about itself, which
 * is exactly the thing that stopped being authoritative.
 */

async function signIn(user: Awaited<ReturnType<typeof renderApp>>["user"]) {
  await user.type(screen.getByLabelText("Email"), TEST_USER.email);
  await user.type(screen.getByLabelText("Password"), TEST_PASSWORD);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("the wall", () => {
  it("lets a signed-in person in whatever `onboardedAt` holds", async () => {
    // Better Auth's client reviver only turns ISO-shaped strings into
    // dates, and anything else used to reach `new Date(x).toISOString()`:
    // a `RangeError` the guard read as "backend unavailable". The session
    // asks only whether a stamp exists.
    sessionActive({ ...TEST_USER, onboardedAt: "not-a-date" });
    deviceHasImported();

    const { router } = await renderApp({ path: "/games" });

    expect(router.state.location.pathname).not.toBe("/login");
  });

  it("sends an unauthenticated visitor from a protected route to login", async () => {
    sessionInactive();

    const { router } = await renderApp({ path: "/games" });

    expect(router.state.location.pathname).toBe("/login");
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    // The whole location, search included, for after they sign in.
    expect(router.state.location.search).toMatchObject({
      redirect: expect.stringContaining("/games") as unknown as string,
    });
  });

  it("protects /import — connecting an account writes, so it needs an owner", async () => {
    sessionInactive();

    const { router } = await renderApp({ path: "/import" });

    expect(router.state.location.pathname).toBe("/login");
  });

  it("lets a signed-in visitor through", async () => {
    sessionActive();
    deviceHasImported();

    const { router } = await renderApp({ path: "/games" });

    expect(router.state.location.pathname).toBe("/games");
    expect(await screen.findByRole("heading", { name: "Games" })).toBeInTheDocument();
  });

  it("keeps them through a reload — the cookie, not the app, is the memory", async () => {
    sessionActive();
    deviceHasImported();

    // The second render is a fresh router over the same server state.
    await renderApp({ path: "/games" });
    const { router } = await renderApp({ path: "/games" });

    expect(router.state.location.pathname).toBe("/games");
  });

  it("turns an already-signed-in visitor away from the login screen", async () => {
    sessionActive();

    const { router } = await renderApp({ path: "/login" });

    expect(router.state.location.pathname).toBe("/games");
  });

  it("does not let a remembered chess account stand in for a session", async () => {
    // What is still in localStorage says which handle to show, not who is
    // asking.
    sessionInactive();
    deviceHasImported();

    const { router } = await renderApp({ path: "/games" });

    expect(router.state.location.pathname).toBe("/login");
  });

  it("keeps a signed-in visitor in, with no chess account selected", async () => {
    // Identity alone is enough to be inside the app.
    sessionActive();
    resetDevice();

    const { router } = await renderApp({ path: "/games" });

    expect(router.state.location.pathname).toBe("/games");
    expect(await screen.findByRole("button", { name: "Import PGN" })).toBeInTheDocument();
  });

  it("does not leave a rejected promise when the session lookup fails", async () => {
    // Unanswered, not signed out: the guard still has to produce a
    // destination.
    sessionUnavailable();

    const { router } = await renderApp({ path: "/games" });

    expect(router.state.location.pathname).toBe("/login");
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("signing in", () => {
  it("establishes a session and opens the app", async () => {
    sessionInactive();
    deviceHasImported();

    const { router, user } = await renderApp({ path: "/login" });
    await signIn(user);

    await waitFor(() => expect(router.state.location.pathname).toBe("/games"));
  });

  it("resumes where the guard interrupted", async () => {
    sessionInactive();
    deviceHasImported();

    const { router, user } = await renderApp({ path: "/games" });
    expect(router.state.location.pathname).toBe("/login");

    await signIn(user);

    await waitFor(() => expect(router.state.location.pathname).toBe("/games"));
  });

  it("says what is wrong on bad credentials, and stays put", async () => {
    sessionInactive();

    const { router, user } = await renderApp({ path: "/login" });
    await user.type(screen.getByLabelText("Email"), TEST_USER.email);
    await user.type(screen.getByLabelText("Password"), "not-the-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid email or password.",
    );
    expect(router.state.location.pathname).toBe("/login");
  });

  it("says what is wrong on a malformed email, not that the server is down", async () => {
    sessionInactive();
    server.use(
      http.post("/api/auth/sign-in/email", () =>
        HttpResponse.json(
          { code: "INVALID_EMAIL", message: "Invalid email" },
          { status: 400 },
        ),
      ),
    );

    const { user } = await renderApp({ path: "/login" });
    await signIn(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid email or password.",
    );
    expect(
      screen.queryByText("Couldn't reach the server. Try again in a moment."),
    ).not.toBeInTheDocument();
  });

  it("tells a failed request apart from a rejected password", async () => {
    sessionInactive();
    server.use(
      http.post("/api/auth/sign-in/email", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    const { user } = await renderApp({ path: "/login" });
    await signIn(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't reach the server",
    );
  });

  it("refuses to submit an empty form", async () => {
    sessionInactive();

    const { router, user } = await renderApp({ path: "/login" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Enter your email.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
  });
});

describe("what a sign-in outcome depends on", () => {
  it("succeeds even when the session endpoint is down — no follow-up fetch", async () => {
    sessionInactive();
    // The session cache is seeded from the sign-in response, so a broken
    // get-session cannot make a successful sign-in look failed.
    server.use(
      http.get("/api/auth/get-session", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    const { router, user } = await renderApp({ path: "/login" });
    await signIn(user);

    await waitFor(() => expect(router.state.location.pathname).toBe("/games"));
  });

  it("reads a 401 without Better Auth's credential code as unavailability", async () => {
    sessionInactive();
    // A proxy or an outage answers 401 too, which is no proof the password
    // was wrong.
    server.use(
      http.post("/api/auth/sign-in/email", () =>
        HttpResponse.json({ message: "upstream timeout" }, { status: 401 }),
      ),
    );

    const { user } = await renderApp({ path: "/login" });
    await signIn(user);

    expect(
      await screen.findByText("Couldn't reach the server. Try again in a moment."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Invalid email or password.")).not.toBeInTheDocument();
  });
});

describe("signing out", () => {
  it("ends the server session and returns to login", async () => {
    sessionActive();
    deviceHasImported();

    const { router, user } = await renderApp({ path: "/games" });

    await user.click(await desktopNav().findByRole("button", { name: "Account" }));
    expect(await screen.findByText(TEST_USER.email)).toBeInTheDocument();

    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));

    // The server forgot, not just this tab: the guard asks again on the way
    // back in.
    const second = await renderApp({ path: "/games" });
    expect(second.router.state.location.pathname).toBe("/login");
  });
});

describe("a session that ends mid-visit", () => {
  it("returns to login when the API answers 401", async () => {
    sessionActive();
    deviceHasImported();

    const { router, queryClient } = await renderApp({ path: "/games" });
    expect(router.state.location.pathname).toBe("/games");

    // The cookie expired between one request and the next, so whatever the
    // session endpoint last said, the data endpoint says 401.
    server.use(
      http.get("/api/games", () =>
        HttpResponse.json({ error: "unauthorized" }, { status: 401 }),
      ),
    );

    // A real request rather than a synthetic event, so the 401 travels the
    // api client, the query cache and router.tsx's single owner.
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["games"] });
    });

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});
