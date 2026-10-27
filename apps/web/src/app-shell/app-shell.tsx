import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Link, useRouterState } from "@tanstack/react-router";
import type * as React from "react";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@velachess/ui/components/sidebar";
import { VelaChessMark } from "@velachess/ui/icons";
import { AppFrame } from "@velachess/ui/layout/app-frame";
import { NavBar } from "@velachess/ui/layout/nav-bar";
import { NavSidebar } from "@velachess/ui/layout/nav-sidebar";

import { BackendStatusBanner } from "../backend-status/index.ts";
import { activeNavId, NAV_ITEMS, NAV_ROUTES, type AppNavItem } from "./nav-items.ts";
import { useSidebarStore } from "./sidebar-store.ts";
import { SidebarUserMenu, UserMenu } from "./user-menu.tsx";

const SHELL_COPY = {
  skipToContent: msg`Skip to content`,
  mainNav: msg`Main`,
  // Both regions offer the same destinations, only one is ever visible —
  // but assistive tech should still be able to tell two landmarks apart
  // by name rather than by which one happens to be `display: none`.
  mainNavBar: msg`Main, bottom bar`,
  resizeNav: msg`Resize navigation`,
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

function BrandLink() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" render={<Link to={NAV_ROUTES.games} />}>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
            <VelaChessMark
              size="micro"
              aria-hidden
              className="*:fill-sidebar-primary-foreground"
            />
          </span>
          <span className="font-medium">VelaChess</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { i18n } = useLingui();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeId = activeNavId(pathname);
  const sidebar = useSidebarStore();

  return (
    <AppFrame
      open={sidebar.open}
      onOpenChange={sidebar.setOpen}
      width={sidebar.width}
      onWidthChange={sidebar.setWidth}
      banner={<BackendStatusBanner />}
      skipLabel={i18n._(SHELL_COPY.skipToContent)}
      nav={
        <NavSidebar
          items={NAV_ITEMS}
          label={i18n._(SHELL_COPY.mainNav)}
          resizeLabel={i18n._(SHELL_COPY.resizeNav)}
          activeId={activeId}
          header={<BrandLink />}
          footer={<SidebarUserMenu />}
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
