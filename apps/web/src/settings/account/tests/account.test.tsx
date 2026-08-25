import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";

import { renderApp } from "../../../test/render.tsx";
import { server } from "../../../test/server.ts";
import {
  linkedProvidersAre,
  sessionActive,
  sessionInactive,
  TEST_USER,
} from "../../../test/handlers/auth.ts";

/**
 * Settings → Account: who you are here, and how you get back in.
 *
 * Driven through the real router and the real shell, because half of what
 * this screen promises is navigational — that the user menu leads here,
 * that the section is behind the same wall as everything else, and that a
 * rename shows up in the shell it was performed from.
 */

describe("reaching the account screen", () => {
  it("opens from the user menu", async () => {
    sessionActive();

    const { router, user } = await renderApp({ path: "/" });

    await user.click(await screen.findByRole("button", { name: "Account" }));
    await user.click(await screen.findByRole("button", { name: "Settings" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/settings/account"));
    expect(await screen.findByRole("heading", { name: "Account" })).toBeInTheDocument();
  });

  it("sends /settings to the only section there is", async () => {
    sessionActive();

    const { router } = await renderApp({ path: "/settings" });

    expect(router.state.location.pathname).toBe("/settings/account");
  });

  it("is behind the same wall as the rest of the app", async () => {
    sessionInactive();

    const { router } = await renderApp({ path: "/settings/account" });

    expect(router.state.location.pathname).toBe("/login");
  });
});

describe("the profile", () => {
  it("shows who is signed in", async () => {
    sessionActive();

    await renderApp({ path: "/settings/account" });

    expect(await screen.findByDisplayValue(TEST_USER.name)).toBeInTheDocument();
    expect(screen.getByDisplayValue(TEST_USER.email)).toBeInTheDocument();
  });

  it("will not let the email be edited here", async () => {
    sessionActive();

    await renderApp({ path: "/settings/account" });

    // Shown because people look for it; disabled because changing it is a
    // verification flow this build cannot complete. An input that accepts
    // typing and silently discards it would be the worse answer.
    const email = await screen.findByLabelText("Email");
    expect(email).toBeDisabled();
    expect(
      screen.getByText(
        "Your email is tied to how you signed up and can't be changed here.",
      ),
    ).toBeInTheDocument();
  });

  it("renames the person, and the shell agrees", async () => {
    sessionActive();

    const { user } = await renderApp({ path: "/settings/account" });

    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Magnus");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved.")).toBeInTheDocument();

    // The point of routing the write through the session query: the name
    // in the shell is the same fact, so it cannot lag behind. Two places
    // now say "Magnus" — this screen's profile, and the menu — and that
    // is precisely the assertion.
    await user.click(screen.getByRole("button", { name: "Account" }));
    await waitFor(() => expect(screen.getAllByText("Magnus")).toHaveLength(2));
  });

  it("refuses an empty name instead of saving one", async () => {
    sessionActive();

    let wrote = false;
    server.use(
      http.post("/api/auth/update-user", () => {
        wrote = true;
        return HttpResponse.json({ status: true });
      }),
    );

    const { user } = await renderApp({ path: "/settings/account" });

    await user.clear(await screen.findByLabelText("Name"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Enter a name.")).toBeInTheDocument();
    expect(wrote).toBe(false);
  });

  it("says so when the save fails", async () => {
    sessionActive();
    server.use(
      http.post("/api/auth/update-user", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    const { user } = await renderApp({ path: "/settings/account" });

    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Magnus");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Couldn't save that. Try again.")).toBeInTheDocument();
  });
});

describe("sign-in methods", () => {
  it("lists the password when that is the only way in", async () => {
    sessionActive();
    linkedProvidersAre(["credential"]);

    await renderApp({ path: "/settings/account" });

    expect(await screen.findByText("Email and password")).toBeInTheDocument();
    expect(screen.queryByText("Google")).not.toBeInTheDocument();
  });

  it("lists both when the account has both", async () => {
    sessionActive();
    linkedProvidersAre(["credential", "google"]);

    await renderApp({ path: "/settings/account" });

    expect(await screen.findByText("Google")).toBeInTheDocument();
    expect(screen.getByText("Email and password")).toBeInTheDocument();
  });

  it("shows only Google for an account that has never had a password", async () => {
    sessionActive();
    linkedProvidersAre(["google"]);

    await renderApp({ path: "/settings/account" });

    expect(await screen.findByText("Google")).toBeInTheDocument();
    expect(screen.queryByText("Email and password")).not.toBeInTheDocument();
  });

  it("offers no way to unlink one", async () => {
    sessionActive();
    linkedProvidersAre(["credential", "google"]);

    await renderApp({ path: "/settings/account" });

    // Deliberate: unlinking the last method locks the person out, and the
    // guard for that is a decision, not a button this screen can render.
    expect(await screen.findByText("Google")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /disconnect|unlink|remove/i }),
    ).toBeNull();
  });

  it("keeps chess platforms out of this list", async () => {
    sessionActive();
    linkedProvidersAre(["credential", "google"]);

    await renderApp({ path: "/settings/account" });

    expect(await screen.findByText("Google")).toBeInTheDocument();
    // Chess.com and Lichess are where games come from, not ways in.
    expect(screen.queryByText("Chess.com")).not.toBeInTheDocument();
    expect(screen.queryByText("Lichess")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Chess.com and Lichess are game sources, not sign-in methods. They live under Import.",
      ),
    ).toBeInTheDocument();
  });

  it("says so when the list cannot be loaded, without hiding the profile", async () => {
    sessionActive();
    server.use(
      http.get("/api/auth/list-accounts", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    await renderApp({ path: "/settings/account" });

    expect(
      await screen.findByText("Couldn't load your sign-in methods."),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue(TEST_USER.name)).toBeInTheDocument();
  });
});

describe("the avatar", () => {
  it("falls back to initials for an account with no picture", async () => {
    sessionActive();

    const { user } = await renderApp({ path: "/" });
    await user.click(await screen.findByRole("button", { name: "Account" }));

    // "VelaChess User" → first and last initial.
    const menu = await screen.findByText(TEST_USER.email);
    expect(
      within(menu.closest("div")!.parentElement!).getByText("VU"),
    ).toBeInTheDocument();
  });
});
