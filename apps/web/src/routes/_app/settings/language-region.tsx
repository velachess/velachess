import { msg } from "@lingui/core/macro";
import { createFileRoute } from "@tanstack/react-router";

import { LanguageRegionScreen } from "../../../settings/language-region/language-region-screen.tsx";

export const Route = createFileRoute("/_app/settings/language-region")({
  staticData: { crumb: msg`Language & region` },
  component: LanguageRegionScreen,
});
