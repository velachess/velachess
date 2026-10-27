import { useLingui } from "@lingui/react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";

import { buttonVariants } from "@velachess/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@velachess/ui/components/tabs";
import { cn } from "@velachess/ui/lib/utils";

import {
  activeSettingsSectionId,
  PREFERENCES_GROUP_LABEL,
  SETTINGS_NAV_ITEMS,
  SETTINGS_NAV_LABEL,
  type SettingsNavItem,
  SETTINGS_ROUTES,
  type SettingsSectionId,
} from "./navigation.ts";

/** Route-driven — active state and navigation both come from the URL, not
 * local state, so a direct link, a refresh, and back/forward all agree. */
export function SettingsNavigation() {
  const { i18n } = useLingui();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const activeId = activeSettingsSectionId(pathname);

  const top = SETTINGS_NAV_ITEMS.filter((item) => item.group === undefined);
  const preferences = SETTINGS_NAV_ITEMS.filter((item) => item.group === "preferences");

  return (
    <>
      <nav
        aria-label={i18n._(SETTINGS_NAV_LABEL)}
        className="sticky top-0 hidden w-48 shrink-0 self-start md:block"
      >
        <ul className="flex flex-col gap-0.5">
          {top.map((item) => (
            <NavRow key={item.id} item={item} active={activeId} />
          ))}
        </ul>

        <p className="mt-5 mb-1.5 px-2.5 text-xs font-medium text-muted-foreground">
          {i18n._(PREFERENCES_GROUP_LABEL)}
        </p>
        <ul className="flex flex-col gap-0.5">
          {preferences.map((item) => (
            <NavRow key={item.id} item={item} active={activeId} />
          ))}
        </ul>
      </nav>

      <Tabs
        // Always a defined value: base-ui's Tabs treats a controlled
        // component switching to `undefined` as becoming uncontrolled,
        // which throws mid-render. `activeId` is momentarily undefined on
        // the render that fires while navigating away from /settings — the
        // fallback keeps that render harmless instead of breaking it.
        value={activeId ?? SETTINGS_NAV_ITEMS[0]!.id}
        onValueChange={(value) => {
          void navigate({ to: SETTINGS_ROUTES[value as SettingsSectionId] });
        }}
        className="md:hidden"
      >
        <TabsList variant="line" className="w-full overflow-x-auto">
          {SETTINGS_NAV_ITEMS.map((item) => (
            <TabsTrigger key={item.id} value={item.id}>
              {i18n._(item.label)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </>
  );
}

function NavRow({
  item,
  active,
}: {
  item: SettingsNavItem;
  active: SettingsSectionId | undefined;
}) {
  const { i18n } = useLingui();
  const Icon = item.icon;
  const isActive = active === item.id;

  return (
    <li>
      <Link
        to={SETTINGS_ROUTES[item.id]}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "w-full justify-start text-muted-foreground",
          isActive && "bg-muted text-foreground",
        )}
      >
        <Icon data-icon="inline-start" />
        {i18n._(item.label)}
      </Link>
    </li>
  );
}
