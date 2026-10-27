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

export function SettingsNavigation() {
  const { i18n } = useLingui();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const activeId = activeSettingsSectionId(pathname);

  const handleTabChange = (value: unknown) => {
    const item = SETTINGS_NAV_ITEMS.find(({ id }) => id === value);
    if (item) void navigate({ to: SETTINGS_ROUTES[item.id] });
  };

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
        // base-ui throws when a controlled Tabs value turns undefined, which
        // `activeId` briefly is while navigating away from /settings.
        value={activeId ?? "account"}
        onValueChange={handleTabChange}
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
