import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://velachess.com",
      lastModified: new Date("2026-08-21"),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
