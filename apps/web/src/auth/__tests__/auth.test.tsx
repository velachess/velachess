import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { renderApp } from "../../test/render.tsx";
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
 * Who gets in, who does not, and what happens when the answer changes
 * mid-session.
 *
 * Every test drives the real screens through the real router: the guard
 * that runs is `_app`'s, the session comes from the same HTTP contract
 * the API publishes, and nothing is stubbed below the network. What a
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
  it("sends an unauthenticated visitor from a protected route to login", async () => {
    sessionInactive();

    const { router } = await renderApp({ path: "/games" });

    expect(router.state.location.pathname).toBe("/login");
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    // Where they were going, kept for after they sign in — the whole
    // location, search included, not just the path.
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

    // A reload is a fresh router over the same server state, which is
    // what this second render is.
    await renderApp({ path: "/games" });
    const { router } = await renderApp({ path: "/games" });

    expect(router.state.location.pathname).toBe("/games");
  });

  it("turns an already-signed-in visitor away from the login screen", async () => {
    sessionActive();

    const { router } = await renderApp({ path: "/login" });

    expect(router.state.location.pathname).toBe("/");
  });

  it("does not let a remembered chess account stand in for a session", async () => {
    // The old authority, still in localStorage, now worth exactly
    // nothing: it says which handle to show, not who is asking.
    sessionInactive();
    deviceHasImported();

    const { router } = await renderApp({ path: "/games" });

    expect(router.state.location.pathname).toBe("/login");
  });

  it("keeps a signed-in visitor in, with no chess account selected", async () => {
    // The inverse: identity is enough to be inside the app. The games
    // screen offers the import form instead of bouncing anyone out.
    sessionActive();
    resetDevice();

    const { router } = await renderApp({ path: "/games" });

    expect(router.state.location.pathname).toBe("/games");
    expect(await screen.findByRole("button", { name: "Import" })).toBeInTheDocument();
  });

  it("does not leave a rejected promise when the session lookup fails", async () => {
    // Not "signed out" — unanswered. The guard still has to produce a
    // destination rather than a blank screen behind an error boundary.
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

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
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
    // The session cache is seeded from the sign-in response itself, so a
    // broken get-session cannot make a successful sign-in look failed.
    server.use(
      http.get("/api/auth/get-session", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    const { router, user } = await renderApp({ path: "/login" });
    await signIn(user);

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("reads a 401 without Better Auth's credential code as unavailability", async () => {
    sessionInactive();
    // A proxy or an outage can also answer 401 — that is not proof the
    // password was wrong, and saying so would send someone to re-type a
    // correct one.
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

    await user.click(await screen.findByRole("button", { name: "Account" }));
    expect(await screen.findByText(TEST_USER.email)).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));

    // And it was the server that forgot, not just this tab: the guard
    // asks again on the way back in, and the answer is no.
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

    // The cookie expired between one request and the next: whatever the
    // session endpoint last said, the data endpoint says 401. Exactly
    // the case where stale UI would keep showing somebody's games.
    server.use(
      http.get("/api/games", () =>
        HttpResponse.json({ error: "unauthorized" }, { status: 401 }),
      ),
    );

    // The next request the screen makes, rather than a synthetic event:
    // the 401 has to travel the real path — api client, query cache,
    // the single owner in router.tsx — to prove that path exists.
    await queryClient.invalidateQueries({ queryKey: ["games"] });

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});
