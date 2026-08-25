import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Outlet } from "@tanstack/react-router";

import { PageHeader } from "@velachess/ui/layout/page-header";

import { SettingsNavigation } from "./settings-navigation.tsx";

const SHELL_COPY = {
  title: msg`Settings`,
  description: msg`Manage your account and application preferences.`,
} as const;

export function SettingsLayout() {
  const { i18n } = useLingui();

  return (
    <>
      <PageHeader
        title={i18n._(SHELL_COPY.title)}
        description={i18n._(SHELL_COPY.description)}
      />
      <div className="flex flex-col gap-6 p-6 md:flex-row md:gap-10">
        <SettingsNavigation />
        <div className="min-w-0 max-w-2xl flex-1">
          <Outlet />
        </div>
      </div>
    </>
  );
}
