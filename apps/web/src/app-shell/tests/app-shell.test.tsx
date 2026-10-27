import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { desktopNav, renderApp } from "../../test/render.tsx";
import { sessionActive, TEST_USER } from "../../test/handlers/auth.ts";

function sidebarState() {
  return document.querySelector("[data-slot=sidebar]")?.getAttribute("data-state");
}

describe("the desktop sidebar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leads home from the logo", async () => {
    sessionActive();
    const { router, user } = await renderApp({ path: "/settings/account" });

    await user.click(desktopNav().getByRole("link", { name: "VelaChess" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/games"));
  });

  it("marks the current destination", async () => {
    sessionActive();
    await renderApp({ path: "/games" });

    expect(desktopNav().getByRole("link", { name: "Games" })).toHaveAttribute(
      "data-active",
    );
  });

  it("collapses to icons and back with Cmd/Ctrl+B", async () => {
    sessionActive();
    await renderApp({ path: "/games" });

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    await waitFor(() => expect(sidebarState()).toBe("collapsed"));

    fireEvent.keyDown(window, { key: "b", metaKey: true });
    await waitFor(() => expect(sidebarState()).toBe("expanded"));
  });

  it("ignores Cmd/Ctrl+B on a small screen, where it is hidden", async () => {
    vi.stubGlobal("matchMedia", (media: string) => ({
      matches: false,
      media,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    sessionActive();
    await renderApp({ path: "/games" });

    const notPrevented = fireEvent.keyDown(window, { key: "b", ctrlKey: true });

    expect(notPrevented).toBe(true);
    expect(sidebarState()).toBe("expanded");
  });

  it("offers a keyboard separator to resize the navigation", async () => {
    sessionActive();
    await renderApp({ path: "/games" });

    expect(
      screen.getByRole("separator", { name: "Resize navigation" }),
    ).toBeInTheDocument();
  });
});

describe("the account menu", () => {
  it("does not repeat who is signed in when the sidebar already shows it", async () => {
    sessionActive();
    const { user } = await renderApp({ path: "/games" });

    await user.click(desktopNav().getByRole("button", { name: "Account" }));
    const menu = await screen.findByRole("menu");

    expect(within(menu).queryByText(TEST_USER.name)).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
  });

  it("names the account when the sidebar is collapsed to icons", async () => {
    sessionActive();
    const { user } = await renderApp({ path: "/games" });

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    await user.click(desktopNav().getByRole("button", { name: "Account" }));
    const menu = await screen.findByRole("menu");

    expect(within(menu).getByText(TEST_USER.name)).toBeInTheDocument();
    expect(within(menu).getByText(TEST_USER.email)).toBeInTheDocument();
    expect(within(menu).queryByText("VU")).not.toBeInTheDocument();
  });

  it("names the account from the bottom bar", async () => {
    sessionActive();
    const { user } = await renderApp({ path: "/games" });

    const bar = within(screen.getByRole("navigation", { name: "Main, bottom bar" }));
    await user.click(bar.getByRole("button", { name: "Account" }));
    const menu = await screen.findByRole("menu");

    expect(within(menu).getByText(TEST_USER.name)).toBeInTheDocument();
    expect(within(menu).getByText(TEST_USER.email)).toBeInTheDocument();
    expect(within(menu).queryByText("VU")).not.toBeInTheDocument();
  });
});
