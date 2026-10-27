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

function AppProviders({
  children,
  queryClient = createQueryClient(),
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
  path?: string;
  /** Leaves the library as the test staged it. By default an empty archive
   * gets one game, so the first-run overlay stays out of screens that are
   * not about it. */
  emptyLibrary?: boolean;
}

export async function renderApp(options: RenderAppOptions = {}) {
  if (options.emptyLibrary !== true && readArchive(ANY_PAGE).total === 0) {
    addGames(aGame());
  }

  const queryClient = createQueryClient();
  const router = createRouter({
    routeTree: testRouteTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [options.path ?? "/games"] }),
    defaultErrorComponent: DefaultRouteError,
  });

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

/** jsdom applies no CSS, so the sidebar and the bottom bar both render;
 * chrome queries scope to the sidebar. */
export function desktopNav() {
  return within(screen.getByRole("navigation", { name: "Main" }));
}

/** Nav labels sit in both navs, so page assertions scope to `main`. */
export function mainContent() {
  return within(screen.getByRole("main"));
}
