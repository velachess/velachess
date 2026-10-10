import { describe, expect, it } from "vitest";

import { activeNavId, NAV_ITEMS, NAV_ROUTES } from "../nav-items.ts";

describe("the destination catalogue", () => {
  it("gives every declared item a route", () => {
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
      expect(item.icon, item.id).toBeDefined();
    }
  });
});

describe("activeNavId", () => {
  it("marks the exact destination", () => {
    expect(activeNavId("/games")).toBe("games");
  });

  it("keeps the section active on a detail route", () => {
    expect(activeNavId("/games/8f2c")).toBe("games");
  });

  it("has nothing active on an unknown route", () => {
    expect(activeNavId("/nowhere")).toBeUndefined();
  });
});
