import { msg } from "@lingui/core/macro";
import { useEffect } from "react";
import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  redirect,
} from "@tanstack/react-router";

import { AppShell } from "../app-shell/app-shell.tsx";
import { GameReview, loadGameReview } from "../games/review/index.ts";
import { GamesList, gamesSearchSchema } from "../games/list/index.ts";
import { ConnectAccount, startSyncEvents } from "../games/import/index.ts";
import { SignInScreen } from "../auth/sign-in/sign-in-screen.tsx";
import { ForgotPasswordScreen } from "../auth/password-reset/forgot-password-screen.tsx";
import { ResetPasswordScreen } from "../auth/password-reset/reset-password-screen.tsx";
import { resetPasswordSearchSchema } from "../auth/password-reset/reset-password-search.ts";
import { AccountScreen } from "../settings/account/account-screen.tsx";
import { AppearanceScreen } from "../settings/appearance/appearance-screen.tsx";
import { ConnectionsScreen } from "../settings/connections/connections-screen.tsx";
import { GameplayScreen } from "../settings/gameplay/gameplay-screen.tsx";
import { LanguageRegionScreen } from "../settings/language-region/language-region-screen.tsx";
import { SettingsLayout } from "../settings/layout/settings-layout.tsx";
import { resolveSession } from "../auth/session.ts";
import { OnboardingOverlay } from "../onboarding/onboarding-overlay.tsx";
import { useQueryClient, type QueryClientType } from "../libs/react-query.ts";

/**
 * `routeTree.gen.ts` is generated and gitignored, so a test cannot import
 * the real tree without a build. This mirrors it where it counts: the ids
 * `getRouteApi` looks routes up by, the `_app` session guard the whole app
 * stands behind, `/login` outside it, and the search schema, imported
 * rather than restated.
 *
 * The app shell is included because global UX, like the backend outage
 * banner, lives in the layout rather than in a slice.
 */
// The guards below resolve the session through this client, as `_app`
// does.
const rootRoute = createRootRouteWithContext<{ queryClient: QueryClientType }>()();

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_app",
  beforeLoad: async ({ context, location }) => {
    const session = await resolveSession(context.queryClient);
    if (session.status === "authenticated") return;

    throw redirect({
      to: "/login",
      search: { redirect: location.href },
      replace: true,
    });
  },
  component: TestAppLayout,
});

function TestAppLayout() {
  const queryClient = useQueryClient();
  // Like `routes/_app.tsx`: the sync stream belongs to the wall.
  useEffect(() => startSyncEvents(queryClient), [queryClient]);

  return (
    <AppShell>
      <Outlet />
      <OnboardingOverlay />
    </AppShell>
  );
}

// A real layout, because `useBreadcrumbTrail` reads this route's
// `staticData` off an ancestor match, which exists only when
// `/games/$gameId` nests under `/games`.
const gamesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/games",
  staticData: { crumb: msg`Games` },
  component: Outlet,
});

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/games", replace: true });
  },
});

const gamesIndexRoute = createRoute({
  getParentRoute: () => gamesRoute,
  path: "/",
  validateSearch: gamesSearchSchema,
  component: GamesList,
});

const analysisRoute = createRoute({
  getParentRoute: () => gamesRoute,
  path: "/$gameId",
  // Like `routes/_app/games/$gameId.tsx`: opening a game starts its
  // analysis, and that is the route's job.
  loader: ({ context, params }) => loadGameReview(context.queryClient, params.gameId),
  component: GameReview,
});

const importRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/import",
  component: ConnectAccount,
});

// Nested for real, like /games: the account screen is reached from the
// shell's user menu, so the link resolves against the tree the menu renders
// inside.
const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings",
  staticData: { crumb: msg`Settings` },
  component: SettingsLayout,
});

const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/settings/account", replace: true });
  },
});

const accountRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/account",
  staticData: { crumb: msg`Account` },
  component: AccountScreen,
});

const connectionsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/connections",
  staticData: { crumb: msg`Connections` },
  component: ConnectionsScreen,
});

const languageRegionRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/language-region",
  staticData: { crumb: msg`Language & region` },
  component: LanguageRegionScreen,
});

const appearanceRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/appearance",
  staticData: { crumb: msg`Appearance` },
  component: AppearanceScreen,
});

const gameplayRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/gameplay",
  staticData: { crumb: msg`Gameplay` },
  component: GameplayScreen,
});

// Public, and the mirror of the guard above: already signed in means there
// is nothing to do here.
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search["redirect"] === "string" ? search["redirect"] : undefined,
    // Like the real route: an OAuth failure comes back on the address bar,
    // and the screen renders a message rather than the code.
    error: typeof search["error"] === "string" ? search["error"] : undefined,
  }),
  beforeLoad: async ({ context, search }) => {
    const session = await resolveSession(context.queryClient);
    if (session.status !== "authenticated") return;

    throw redirect({ to: search.redirect ?? "/", replace: true });
  },
  component: TestLoginRoute,
});

function TestLoginRoute() {
  const { redirect: destination, error } = loginRoute.useSearch();
  return (
    <SignInScreen
      {...(destination ? { redirect: destination } : {})}
      {...(error ? { oauthError: error } : {})}
    />
  );
}

// Mirrors `routes/forgot-password.tsx` and `routes/reset-password.tsx`.
const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/forgot-password",
  component: ForgotPasswordScreen,
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset-password",
  validateSearch: resetPasswordSearchSchema,
  component: TestResetPasswordRoute,
});

function TestResetPasswordRoute() {
  const { token } = resetPasswordRoute.useSearch();
  return <ResetPasswordScreen {...(token ? { token } : {})} />;
}

let crashRouteThrows = false;

export function makeCrashRouteThrow() {
  crashRouteThrows = true;
}

export function makeCrashRouteRecover() {
  crashRouteThrows = false;
}

function CrashRoute() {
  if (crashRouteThrows) throw new Error("intentional crash");
  return <main>Crash recovered</main>;
}

const crashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/crash",
  component: CrashRoute,
});

export const testRouteTree = rootRoute.addChildren([
  appRoute.addChildren([
    indexRoute,
    gamesRoute.addChildren([gamesIndexRoute, analysisRoute]),
    importRoute,
    settingsRoute.addChildren([
      settingsIndexRoute,
      accountRoute,
      connectionsRoute,
      languageRegionRoute,
      appearanceRoute,
      gameplayRoute,
    ]),
  ]),
  loginRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  crashRoute,
]);
