import { I18nProvider } from "@lingui/react";
import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import type * as React from "react";

import { Toaster } from "@velachess/ui/components/toast";
import { TooltipProvider } from "@velachess/ui/components/tooltip";

import appCss from "@velachess/ui/globals.css?url";

import { i18n } from "../i18n/index.ts";
import { queryClient } from "../shared/query/query-client.ts";
import { QueryClientProvider, type QueryClientType } from "../shared/libs/query/index.ts";

interface RouterContext {
  queryClient: QueryClientType;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "VelaChess" },
      { name: "theme-color", content: "#0B1020" },
      { property: "og:image", content: "/og-image.svg" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "mask-icon", href: "/safari-pinned-tab.svg", color: "#0B1020" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1 className="text-2xl font-medium">404</h1>
      <p className="text-muted-foreground">The requested page could not be found.</p>
    </main>
  ),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <I18nProvider i18n={i18n}>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <Toaster>{children}</Toaster>
            </TooltipProvider>
          </QueryClientProvider>
        </I18nProvider>
        <Scripts />
      </body>
    </html>
  );
}
