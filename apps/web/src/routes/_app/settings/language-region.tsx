import { createFileRoute } from "@tanstack/react-router";

import { LanguageRegionScreen } from "../../../settings/language-region/language-region-screen.tsx";

export const Route = createFileRoute("/_app/settings/language-region")({
  component: LanguageRegionScreen,
});
