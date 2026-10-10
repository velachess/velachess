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
import { addGames, readArchive } from "./archive.ts";
import { aGame } from "./games.ts";
import { testRouteTree } from "./routes.tsx";

const ANY_PAGE = { color: null, outcome: null, timeClass: null, page: 1, pageSize: 1 };

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

export interface RenderAppOptions {
  /** Where memory history starts, search string included. */
  path?: string;
  /** Leave the library as the test staged it. By default an archive with no games gets one, so the first-run overlay stays out of screens that are not about it. */
  emptyLibrary?: boolean;
}

/** Mounts the app at a route, for search params/navigation/guards. `router.load()` is awaited inside `act` so the caller gets the rendered screen, not pending. */
export async function renderApp(options: RenderAppOptions = {}) {
  if (options.emptyLibrary !== true && readArchive(ANY_PAGE).total === 0) {
    addGames(aGame());
  }

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

/** Same reasoning as {@link desktopNav}: a nav item's label (`Games`,
 * `Settings`, …) sits in both navs too, so a page-content
 * assertion for the same word scopes to `main` — the one region that
 * isn't duplicated — rather than the whole document. */
export function mainContent() {
  return within(screen.getByRole("main"));
}
