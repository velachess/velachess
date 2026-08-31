import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Link, useRouterState } from "@tanstack/react-router";
import type * as React from "react";

import { VelaChessMark } from "@velachess/ui/icons";
import { AppFrame } from "@velachess/ui/layout/app-frame";
import { NavDock } from "@velachess/ui/layout/nav-dock";

import { drillQueueQuery } from "../drill/queries.ts";
import { useQuery } from "../libs/react-query.ts";
import { BackendStatusBanner } from "../backend-status/index.ts";
import { activeNavId, navItemsFor, NAV_ROUTES } from "./nav-items.ts";
import { UserMenu } from "./user-menu.tsx";

const SHELL_COPY = {
  skipToContent: msg`Skip to content`,
  mainNav: msg`Main`,
} as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { i18n } = useLingui();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: queue } = useQuery(drillQueueQuery());

  const items = navItemsFor({ drillQueue: queue });

  return (
    <AppFrame
      banner={<BackendStatusBanner />}
      skipLabel={i18n._(SHELL_COPY.skipToContent)}
      nav={
        <NavDock
          items={items}
          brand={<VelaChessMark size="micro" className="size-5" />}
          label={i18n._(SHELL_COPY.mainNav)}
          activeId={activeNavId(pathname)}
          footer={<UserMenu />}
          renderItem={(item, content) => (
            <Link to={NAV_ROUTES[item.id]} aria-label={item.label}>
              {content}
            </Link>
          )}
        />
      }
    >
      {children}
    </AppFrame>
  );
}
