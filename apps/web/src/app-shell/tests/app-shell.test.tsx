import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { desktopNav, renderApp } from "../../test/render.tsx";
import { sessionActive, TEST_USER } from "../../test/handlers/auth.ts";
import { useSidebarStore } from "../sidebar-store.ts";

const SIDEBAR_STORAGE_KEY = "velachess.sidebar";

function sidebarState() {
  return document.querySelector("[data-slot=sidebar]")?.getAttribute("data-state");
}

function sidebarWidth() {
  return document
    .querySelector<HTMLElement>("[data-slot=sidebar-wrapper]")
    ?.style.getPropertyValue("--sidebar-width");
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

  it("remembers that it was collapsed", async () => {
    sessionActive();
    await renderApp({ path: "/games" });

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });

    expect(sidebarState()).toBe("collapsed");
    expect(JSON.parse(localStorage.getItem(SIDEBAR_STORAGE_KEY) ?? "{}")).toMatchObject({
      state: { open: false },
    });
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

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });

    expect(sidebarState()).toBe("expanded");
    expect(useSidebarStore.getState().open).toBe(true);
  });

  it("restores the saved width and state on the next visit", async () => {
    localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      JSON.stringify({ state: { open: true, width: 300 }, version: 1 }),
    );
    await useSidebarStore.persist.rehydrate();
    sessionActive();

    await renderApp({ path: "/games" });

    expect(sidebarState()).toBe("expanded");
    expect(sidebarWidth()).toBe("300px");
    expect(screen.getByRole("separator", { name: "Resize navigation" })).toHaveAttribute(
      "aria-valuenow",
      "300",
    );
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
  });

  it("names the account from the bottom bar", async () => {
    sessionActive();
    const { user } = await renderApp({ path: "/games" });

    const bar = within(screen.getByRole("navigation", { name: "Main, bottom bar" }));
    await user.click(bar.getByRole("button", { name: "Account" }));
    const menu = await screen.findByRole("menu");

    expect(within(menu).getByText(TEST_USER.name)).toBeInTheDocument();
    expect(within(menu).getByText(TEST_USER.email)).toBeInTheDocument();
  });
});
