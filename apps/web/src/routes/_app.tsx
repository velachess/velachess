import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "../app-shell/app-shell.tsx";
import { resolveSession } from "../auth/session.ts";
import { useSyncEvents } from "../games/import/index.ts";
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
  // One stream for the session, not one per screen: this layout exists
  // exactly while someone is signed in, so the connection opens with it and
  // closes when the wall comes down.
  useSyncEvents();

  return (
    <AppShell>
      <Outlet />
      {/* Over every screen, not one screen: an empty account has nothing
          to list or review anywhere behind the wall. */}
      <OnboardingOverlay />
    </AppShell>
  );
}
