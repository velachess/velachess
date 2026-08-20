import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import type { MessageDescriptor } from "@lingui/core";

import { routeTree } from "./routeTree.gen.ts";
import { sessionQueryKey } from "./auth/session.ts";
import { onUnauthorized } from "./shared/api/unauthorized.ts";
import { queryClient } from "./shared/query/query-client.ts";
import { DefaultRouteError } from "./shared/ui/route-error.tsx";

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    // Route guards run before components exist, so they read data through
    // the query cache rather than a hook.
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultRouteError,
  });

  // The one place a 401 becomes a navigation — redirecting inside the
  // fetch wrapper itself would loop. Guarded on path so a 401 already on
  // `/login` just clears the cache.
  onUnauthorized(() => {
    queryClient.setQueryData(sessionQueryKey, null);
    if (router.state.location.pathname === "/login") return;
    void router.navigate({ to: "/login", replace: true });
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
  interface StaticDataRouteOption {
    /** The label a route contributes to `useBreadcrumbTrail`, when it is
     * ever a trail ancestor. Absent on routes that never nest a child. */
    crumb?: MessageDescriptor;
  }
}
