import { msg } from "@lingui/core/macro";
import { VELACHESS_THEME_COLORS } from "@velachess/ui/styles/theme-colors";
import type { MetadataRoute } from "next";

import { i18n } from "../locales/index.ts";

const MANIFEST_COPY = {
  name: msg`VelaChess`,
  description: msg`Turn your games into training.`,
} as const;

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: i18n._(MANIFEST_COPY.name),
    short_name: i18n._(MANIFEST_COPY.name),
    description: i18n._(MANIFEST_COPY.description),
    start_url: "/",
    display: "standalone",
    background_color: VELACHESS_THEME_COLORS.light.background,
    theme_color: VELACHESS_THEME_COLORS.light.primary,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
