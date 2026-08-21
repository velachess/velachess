import { msg } from "@lingui/core/macro";
import type { MetadataRoute } from "next";

import { i18n } from "../shared/i18n.ts";

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
    background_color: "#0b0d12",
    theme_color: "#0b0d12",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
