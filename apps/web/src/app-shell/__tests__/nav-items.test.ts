import { describe, expect, it } from "vitest";

import { activeNavId, NAV_ITEMS, NAV_ROUTES, navItemsFor } from "../nav-items.ts";

describe("the destination catalogue", () => {
  it("gives every declared item a route", () => {
    // The dock renders NAV_ITEMS and links through NAV_ROUTES; an item
    // missing from either would render as a dead icon.
    expect(NAV_ITEMS.map((item) => item.id).toSorted()).toEqual(
      Object.keys(NAV_ROUTES).toSorted(),
    );
  });

  it("points each destination somewhere different", () => {
    const routes = NAV_ITEMS.map((item) => NAV_ROUTES[item.id]);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("labels and icons every item, since the rail shows nothing else", () => {
    for (const item of NAV_ITEMS) {
      expect(item.label, item.id).toBeTruthy();
      // Lucide icons are forwardRef objects, not plain functions.
      expect(item.icon, item.id).toBeDefined();
    }
  });
});

describe("activeNavId", () => {
  it("marks the exact destination", () => {
    expect(activeNavId("/")).toBe("dashboard");
    expect(activeNavId("/games")).toBe("games");
    expect(activeNavId("/drill")).toBe("drill");
  });

  it("keeps the section active on a detail route", () => {
    // Reviewing one game lives under Games, and the dock has to say so.
    expect(activeNavId("/games/8f2c")).toBe("games");
  });

  it("does not let the dashboard match everything", () => {
    // "/" is a prefix of every path — matching it by prefix would light up
    // Dashboard on every screen.
    expect(activeNavId("/insights")).toBe("insights");
    expect(activeNavId("/repertoire")).toBe("repertoire");
  });

  it("has nothing active on an unknown route", () => {
    expect(activeNavId("/nowhere")).toBeUndefined();
  });
});

describe("navItemsFor", () => {
  it("badges the drill item with everything waiting, reviews and new", () => {
    // The badge and the drill screen have to agree. `overview.dueCards`
    // counts only scheduled cards past due, so reading that left the
    // menu saying 7 while the page said 12.
    const items = navItemsFor({
      drillQueue: {
        due: 7,
        fresh: 5,
        byOrigin: {
          "repertoire-deviation": 4,
          "engine-blunder": 9,
          "repertoire-line": 0,
        },
      },
    });

    expect(items.find((item) => item.id === "drill")?.badge).toBe(12);
  });

  it("leaves every other item unbadged", () => {
    // A badge is opt-in per entry, so a new one is a getBadge on its own
    // config rather than another branch in the shell.
    const items = navItemsFor({
      drillQueue: {
        due: 1,
        fresh: 0,
        byOrigin: {
          "repertoire-deviation": 1,
          "engine-blunder": 0,
          "repertoire-line": 0,
        },
      },
    });

    expect(
      items.filter((item) => item.badge !== undefined).map((item) => item.id),
    ).toEqual(["drill"]);
  });

  it("shows no badge while the queue has not loaded", () => {
    // Zero would be a claim; absent is the truth until it answers.
    const items = navItemsFor({ drillQueue: undefined });

    expect(items.every((item) => item.badge === undefined)).toBe(true);
  });
});
