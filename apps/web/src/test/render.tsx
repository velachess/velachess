import { I18nProvider } from "@lingui/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";

import { Toaster } from "@velachess/ui/components/toast";
import { TooltipProvider } from "@velachess/ui/components/tooltip";
import { ThemeProvider } from "@velachess/ui/lib/theme-provider";

import { i18n } from "../i18n/index.ts";
import { sessionQueryKey } from "../auth/session.ts";
import { QueryClientProvider, type QueryClientType } from "../libs/react-query.ts";
import { onUnauthorized } from "../api/index.ts";
import { createQueryClient } from "../query/index.ts";
import { DefaultRouteError } from "../route-error.tsx";
import { testRouteTree } from "./routes.tsx";

/** The providers `__root.tsx` gives every screen, in the same order — kept identical so this list can't drift from the app. */
function AppProviders({
  children,
  queryClient = createQueryClient({ retry: false }),
}: {
  children: React.ReactNode;
  queryClient?: QueryClientType;
}) {
  return (
    <ThemeProvider>
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster>{children}</Toaster>
          </TooltipProvider>
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

/** One screen's worth of UI, without a route — for states reached by props, not navigation. Same providers as the app. */
export function renderInApp(ui: React.ReactNode) {
  // Per render, never shared — a client that outlives a test carries the
  // previous one's rows into the next.
  return render(<AppProviders>{ui}</AppProviders>);
}

export interface RenderAppOptions {
  /** Where memory history starts, search string included. */
  path?: string;
}

/** Mounts the app at a route, for search params/navigation/guards. `router.load()` is awaited inside `act` so the caller gets the rendered screen, not pending. */
export async function renderApp(options: RenderAppOptions = {}) {
  // One client for the guards and the components — same wiring as
  // router.tsx, so a guard's session and a screen's session can't disagree.
  const queryClient = createQueryClient({ retry: false });
  const router = createRouter({
    routeTree: testRouteTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [options.path ?? "/games"] }),
    defaultErrorComponent: DefaultRouteError,
  });

  // Mirrors router.tsx: one owner for "the API said 401".
  const releaseUnauthorized = onUnauthorized(() => {
    queryClient.setQueryData(sessionQueryKey, null);
    if (router.state.location.pathname === "/login") return;
    void router.navigate({ to: "/login", replace: true });
  });

  const user = userEvent.setup();
  const result = render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  await act(async () => {
    await router.load();
  });

  return { ...result, user, router, queryClient, releaseUnauthorized };
}

/**
 * `AppShell` renders the same destinations and account menu twice — the
 * desktop rail and a mobile bottom bar — and switches between them with
 * CSS alone. jsdom applies none, so both sit in the tree at once here; a
 * bare `screen` query for a nav label or the account button matches
 * twice. Screens that reach through the chrome incidentally (not testing
 * the nav itself) scope to the rail, the region that was here first.
 */
export function desktopNav() {
  return within(screen.getByRole("navigation", { name: "Main" }));
}

/** Same reasoning as {@link desktopNav}: a nav item's label (`Dashboard`,
 * `Insights`, `Drill`, …) sits in both navs too, so a page-content
 * assertion for the same word scopes to `main` — the one region that
 * isn't duplicated — rather than the whole document. */
export function mainContent() {
  return within(screen.getByRole("main"));
}
