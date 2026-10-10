import type { LinkProps } from "@tanstack/react-router";
import { History } from "@velachess/ui/icons";
import type { NavDockItem } from "@velachess/ui/layout/nav-dock";

export type NavId = "games";

export interface AppNavItem extends NavDockItem {
  id: NavId;
}

type NavRoute = NonNullable<LinkProps["to"]>;

export const NAV_ROUTES: Record<NavId, NavRoute> = {
  games: "/games",
};

export const NAV_ITEMS: AppNavItem[] = [{ id: "games", label: "Games", icon: History }];

/** A detail route keeps its section lit. */
export function activeNavId(pathname: string): NavId | undefined {
  return NAV_ITEMS.find(({ id }) => pathname.startsWith(NAV_ROUTES[id]))?.id;
}
