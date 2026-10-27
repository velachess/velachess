import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { desktopNav, renderApp } from "../../test/render.tsx";
import { sessionActive } from "../../test/handlers/auth.ts";
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
