import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Link, useRouterState } from "@tanstack/react-router";
import type * as React from "react";

import { VelaChessMark } from "@velachess/ui/icons";
import { AppFrame } from "@velachess/ui/layout/app-frame";
import { NavBar } from "@velachess/ui/layout/nav-bar";
import { NavDock } from "@velachess/ui/layout/nav-dock";

import { BackendStatusBanner } from "../backend-status/index.ts";
import { activeNavId, NAV_ITEMS, NAV_ROUTES, type AppNavItem } from "./nav-items.ts";
import { UserMenu } from "./user-menu.tsx";

const SHELL_COPY = {
  skipToContent: msg`Skip to content`,
  mainNav: msg`Main`,
  // Both regions offer the same destinations, only one is ever visible —
  // but assistive tech should still be able to tell two landmarks apart
  // by name rather than by which one happens to be `display: none`.
  mainNavBar: msg`Main, bottom bar`,
} as const;

function renderNavItem(item: AppNavItem, content: React.ReactNode) {
  return (
    <Link to={NAV_ROUTES[item.id]} aria-label={item.label}>
      {content}
    </Link>
  );
}

/** `contents`: the link generates no box of its own, so `NavBar`'s
 * fixed-size slot — not the link's shrink-wrapped content — is what the
 * bar's flexbox sizes and what the click target visually is. */
function renderBarItem(item: AppNavItem, content: React.ReactNode) {
  return (
    <Link to={NAV_ROUTES[item.id]} aria-label={item.label} className="contents">
      {content}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { i18n } = useLingui();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeId = activeNavId(pathname);

  return (
    <AppFrame
      banner={<BackendStatusBanner />}
      skipLabel={i18n._(SHELL_COPY.skipToContent)}
      nav={
        <NavDock
          items={NAV_ITEMS}
          brand={<VelaChessMark size="micro" className="size-5" />}
          label={i18n._(SHELL_COPY.mainNav)}
          activeId={activeId}
          footer={<UserMenu />}
          renderItem={renderNavItem}
        />
      }
      navFallback={
        <NavBar
          items={NAV_ITEMS}
          label={i18n._(SHELL_COPY.mainNavBar)}
          activeId={activeId}
          footer={<UserMenu />}
          renderItem={renderBarItem}
        />
      }
    >
      {children}
    </AppFrame>
  );
}
