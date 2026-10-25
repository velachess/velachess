import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import {
  linkedProvidersAre,
  revokingSessionsFails,
  sessionActive,
  sessionInactive,
  signInMethodsAre,
} from "../../../test/handlers/auth.ts";
import { renderApp } from "../../../test/render.tsx";
import { server } from "../../../test/server.ts";

async function openDialog() {
  const rendered = await renderApp({ path: "/settings/account" });
  await rendered.user.click(
    await screen.findByRole("button", { name: "Sign out everywhere" }),
  );
  const dialog = await screen.findByRole("alertdialog", { name: "Sign out everywhere?" });
  return { ...rendered, dialog: within(dialog) };
}

describe("signing out everywhere", () => {
  it("revokes every session and lands on the login screen", async () => {
    sessionActive();
    let revoked = false;
    server.use(
      http.post("/api/auth/revoke-sessions", () => {
        revoked = true;
        sessionInactive();
        return HttpResponse.json({ status: true });
      }),
    );

    const { user, dialog, router } = await openDialog();
    expect(revoked).toBe(false);
    await user.click(dialog.getByRole("button", { name: "Sign out everywhere" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(revoked).toBe(true);
  });

  it("asks first, and cancelling signs nobody out", async () => {
    sessionActive();
    let revoked = false;
    server.use(
      http.post("/api/auth/revoke-sessions", () => {
        revoked = true;
        return HttpResponse.json({ status: true });
      }),
    );

    const { user, dialog, router } = await openDialog();
    await user.click(dialog.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(revoked).toBe(false);
    expect(router.state.location.pathname).toBe("/settings/account");
  });

  it("keeps the person signed in and says so when the server refuses", async () => {
    sessionActive();
    revokingSessionsFails();

    const { user, dialog, router } = await openDialog();
    await user.click(dialog.getByRole("button", { name: "Sign out everywhere" }));

    expect(
      await dialog.findByText("Couldn't sign out everywhere. Try again."),
    ).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Sign out everywhere" })).toBeEnabled();
    expect(router.state.location.pathname).toBe("/settings/account");
  });
});

describe("the sign-in methods list", () => {
  it("shows the email link on an instance that offers it", async () => {
    sessionActive();
    linkedProvidersAre([]);
    signInMethodsAre({ magicLink: true });

    await renderApp({ path: "/settings/account" });

    expect(await screen.findByText("Email link")).toBeInTheDocument();
    expect(screen.queryByText("Email and password")).not.toBeInTheDocument();
  });
});
