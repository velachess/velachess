import type { LinkProps } from "@tanstack/react-router";
import {
  BookOpen,
  ChartNoAxesColumn,
  LayoutDashboard,
  Target,
  History,
} from "@velachess/ui/icons";
import type { NavDockItem } from "@velachess/ui/layout/nav-dock";

import type { DrillQueue } from "../drill/queries.ts";

export type NavId = "dashboard" | "games" | "drill" | "repertoire" | "insights";

export interface AppNavItem extends NavDockItem {
  id: NavId;
}

type NavRoute = NonNullable<LinkProps["to"]>;

export const NAV_ROUTES: Record<NavId, NavRoute> = {
  dashboard: "/",
  games: "/games",
  drill: "/drill",
  repertoire: "/repertoire",
  insights: "/insights",
};

export interface NavBadgeContext {
  drillQueue: DrillQueue | undefined;
}

interface NavItemConfig extends AppNavItem {
  /** Undefined means no badge — including while its data is loading. */
  getBadge?: (context: NavBadgeContext) => number | undefined;
}

const NAV_CONFIG: NavItemConfig[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "games", label: "Games", icon: History },
  {
    id: "drill",
    label: "Drill",
    icon: Target,
    // Must match the drill screen's total — overview.dueCards excludes
    // seeded-but-never-scheduled cards and would under-count the badge.
    getBadge: ({ drillQueue }) =>
      drillQueue ? drillQueue.due + drillQueue.fresh : undefined,
  },
  { id: "repertoire", label: "Repertoire", icon: BookOpen },
  { id: "insights", label: "Insights", icon: ChartNoAxesColumn },
];

/** Key omitted (not set to `undefined`) — `exactOptionalPropertyTypes` treats those as different. */
export function navItemsFor(context: NavBadgeContext): AppNavItem[] {
  return NAV_CONFIG.map(({ getBadge, ...item }) => {
    const badge = getBadge?.(context);
    return badge === undefined ? item : { ...item, badge };
  });
}

export const NAV_ITEMS: AppNavItem[] = navItemsFor({ drillQueue: undefined });

/** Longest match wins so a detail route keeps its section lit; "/" matches only itself. */
export function activeNavId(pathname: string): NavId | undefined {
  const matched = NAV_ITEMS.filter(({ id }) =>
    NAV_ROUTES[id] === "/" ? pathname === "/" : pathname.startsWith(NAV_ROUTES[id]),
  );

  return matched.toSorted((a, b) => NAV_ROUTES[b.id].length - NAV_ROUTES[a.id].length)[0]
    ?.id;
}
