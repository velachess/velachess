import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "../app-shell/app-shell.tsx";
import { resolveSession } from "../auth/session.ts";
import { OnboardingOverlay } from "../onboarding/onboarding-overlay.tsx";

/**
 * Auth wall: one layout-level `beforeLoad` check. Server session is the only authority —
 * a prior localStorage flag survived sign-out and was forgeable via devtools.
 */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    const session = await resolveSession(context.queryClient);
    if (session.status === "authenticated") return;

    throw redirect({
      to: "/login",
      search: { redirect: location.href },
      replace: true,
    });
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
      {/* Over every screen, not one screen: an empty account has nothing
          to list, drill or review anywhere behind the wall. */}
      <OnboardingOverlay />
    </AppShell>
  );
}
