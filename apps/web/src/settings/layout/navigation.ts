import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { LinkProps } from "@tanstack/react-router";

export type SettingsSectionId =
  | "account"
  | "connections"
  | "language-region"
  | "appearance"
  | "gameplay";

type SettingsRoute = NonNullable<LinkProps["to"]>;

export const SETTINGS_ROUTES: Record<SettingsSectionId, SettingsRoute> = {
  account: "/settings/account",
  connections: "/settings/connections",
  "language-region": "/settings/language-region",
  appearance: "/settings/appearance",
  gameplay: "/settings/gameplay",
};

export interface SettingsNavItem {
  id: SettingsSectionId;
  label: MessageDescriptor;
  group?: "preferences";
}

const NAV_COPY = {
  account: msg`Account`,
  connections: msg`Connections`,
  languageRegion: msg`Language & region`,
  appearance: msg`Appearance`,
  gameplay: msg`Gameplay`,
} as const;

export const PREFERENCES_GROUP_LABEL = msg`Preferences`;

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: "account", label: NAV_COPY.account },
  { id: "connections", label: NAV_COPY.connections },
  { id: "language-region", label: NAV_COPY.languageRegion, group: "preferences" },
  { id: "appearance", label: NAV_COPY.appearance, group: "preferences" },
  { id: "gameplay", label: NAV_COPY.gameplay, group: "preferences" },
];

/** Longest match wins, same rule the main nav dock uses. */
export function activeSettingsSectionId(pathname: string): SettingsSectionId | undefined {
  const matched = SETTINGS_NAV_ITEMS.filter(({ id }) =>
    pathname.startsWith(SETTINGS_ROUTES[id]),
  );

  return matched.toSorted(
    (a, b) => SETTINGS_ROUTES[b.id].length - SETTINGS_ROUTES[a.id].length,
  )[0]?.id;
}
