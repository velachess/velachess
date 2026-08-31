import { msg } from "@lingui/core/macro";
import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  redirect,
} from "@tanstack/react-router";

import { AppShell } from "../app-shell/app-shell.tsx";
import { Dashboard } from "../dashboard/dashboard.tsx";
import { Drill } from "../drill/drill.tsx";
import { GameAnalysis } from "../games/open-game/game-analysis.tsx";
import { GamesList } from "../games/games-list.tsx";
import { ImportGames } from "../games/import/import-games.tsx";
import { SignInScreen } from "../auth/sign-in/sign-in-screen.tsx";
import { AccountScreen } from "../settings/account/account-screen.tsx";
import { AppearanceScreen } from "../settings/appearance/appearance-screen.tsx";
import { ConnectionsScreen } from "../settings/connections/connections-screen.tsx";
import { GameplayScreen } from "../settings/gameplay/gameplay-screen.tsx";
import { LanguageRegionScreen } from "../settings/language-region/language-region-screen.tsx";
import { SettingsLayout } from "../settings/layout/settings-layout.tsx";
import { resolveSession } from "../auth/session.ts";
import { gamesSearchSchema } from "../games/list/filters.ts";
import { drillSearchSchema } from "../drill/queries.ts";
import { Insights } from "../insights/insights.tsx";
import { ChapterStudy } from "../repertoire/chapter-study.tsx";
import { RepertoireDetail } from "../repertoire/repertoire-detail.tsx";
import { RepertoireLanding } from "../repertoire/repertoire-landing.tsx";
import { RepertoirePractice } from "../repertoire/repertoire-practice.tsx";
import { practiceSearchSchema } from "../repertoire/queries.ts";
import { OnboardingOverlay } from "../onboarding/onboarding-overlay.tsx";
import type { QueryClientType } from "../libs/react-query.ts";

/**
 * The app's routes, by hand: `routeTree.gen.ts` is generated and
 * gitignored, so a test cannot import the real tree without a build.
 * This mirrors it where it counts — the ids (`getRouteApi` looks routes
 * up by id), the `_app` session guard (worth exercising, not stubbing —
 * it is the wall the whole app stands behind), `/login` outside it, and
 * the search schema, imported rather than restated.
 *
 * The app shell is included because global UX, like the backend outage
 * banner, lives in the layout rather than in a slice.
 */
// Same context the app's root declares: the guards below resolve the
// session through this client, exactly as `_app` does in production.
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
  return (
    <AppShell>
      <Outlet />
      <OnboardingOverlay />
    </AppShell>
  );
}

// A real layout, not the flat `games_.$gameId` sibling trick the generated
// tree used before nesting was needed: `useBreadcrumbTrail` reads this
// route's `staticData` off an ancestor match, which only exists when
// `/games/$gameId` genuinely nests under `/games`.
const gamesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/games",
  staticData: { crumb: msg`Games` },
  component: Outlet,
});

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: Dashboard,
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
  component: GameAnalysis,
});

const drillRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/drill",
  staticData: { crumb: msg`Drill` },
  validateSearch: drillSearchSchema,
  component: Drill,
});

// Same real-nesting reason as /games: the study screen's breadcrumb
// reads the layout's crumb off an ancestor match.
const repertoireRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/repertoire",
  staticData: { crumb: msg`Repertoire` },
  component: Outlet,
});

const repertoireIndexRoute = createRoute({
  getParentRoute: () => repertoireRoute,
  path: "/",
  component: RepertoireLanding,
});

const repertoireDetailRoute = createRoute({
  getParentRoute: () => repertoireRoute,
  path: "/$repertoireId",
  component: RepertoireDetail,
});

const repertoirePracticeRoute = createRoute({
  getParentRoute: () => repertoireRoute,
  path: "/$repertoireId/practice",
  validateSearch: practiceSearchSchema,
  component: RepertoirePractice,
});

const chapterStudyRoute = createRoute({
  getParentRoute: () => repertoireRoute,
  path: "/$repertoireId/$chapterId",
  component: ChapterStudy,
});

const insightsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/insights",
  staticData: { crumb: msg`Insights` },
  component: Insights,
});

const importRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/import",
  component: ImportGames,
});

// Nested for real, like /games and /repertoire: the account screen is
// reached from the shell's user menu, so the link has to resolve against
// the same tree the menu renders inside.
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

// Public, and the mirror image of the guard above: already signed in
// means there is nothing to do here.
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search["redirect"] === "string" ? search["redirect"] : undefined,
    // Mirrors the real route: an OAuth failure comes back on the address
    // bar, and the screen renders a message rather than the raw code.
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
    dashboardRoute,
    gamesRoute.addChildren([gamesIndexRoute, analysisRoute]),
    repertoireRoute.addChildren([
      repertoireIndexRoute,
      repertoireDetailRoute,
      repertoirePracticeRoute,
      chapterStudyRoute,
    ]),
    drillRoute,
    insightsRoute,
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
  crashRoute,
]);
