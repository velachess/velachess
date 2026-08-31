import { msg } from "@lingui/core/macro";
import { ThemeProvider } from "@velachess/ui/lib/theme-provider";
import { themeInitScript } from "@velachess/ui/lib/theme";
import { VELACHESS_THEME_COLORS } from "@velachess/ui/styles/theme-colors";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import type { ReactNode } from "react";

import { i18n } from "../locales/index.ts";
import "./globals.css";

const spaceGrotesk = localFont({
  src: "../../../../libs/ui/src/styles/fonts/space-grotesk-latin.woff2",
  display: "optional",
  weight: "300 700",
  variable: "--font-space-grotesk",
});

const META_COPY = {
  title: msg`VelaChess - Turn your games into training`,
  description: msg`Import your Chess.com and Lichess games, understand recurring mistakes, and train the positions that cost you points.`,
} as const;

const THEME_BOOTSTRAP = `${themeInitScript({ storageKey: "velachess-theme" })};document.documentElement.classList.remove("no-js")`;

export const metadata: Metadata = {
  metadataBase: new URL("https://velachess.com"),
  title: i18n._(META_COPY.title),
  description: i18n._(META_COPY.description),
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: i18n._(msg`VelaChess`),
    title: i18n._(META_COPY.title),
    description: i18n._(META_COPY.description),
    images: [{ url: "/og-image.svg", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: i18n._(META_COPY.title),
    description: i18n._(META_COPY.description),
    images: ["/og-image.svg"],
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    {
      media: "(prefers-color-scheme: light)",
      color: VELACHESS_THEME_COLORS.light.background,
    },
    {
      media: "(prefers-color-scheme: dark)",
      color: VELACHESS_THEME_COLORS.dark.background,
    },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} no-js`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        {/* beforeInteractive runs before hydration, same timing a raw
            <script> gets from the browser — needed here to avoid a
            flash of the wrong theme. React 19 logs a dev-only warning
            for any rendered <script> node ("Encountered a script tag
            while rendering React component"); it is a known upstream
            false positive (next-themes#387) with no clean fix yet — the
            script still runs correctly, and the warning never ships to
            production. */}
        <Script
          id="theme-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }}
        />
        <ThemeProvider storageKey="velachess-theme">{children}</ThemeProvider>
      </body>
    </html>
  );
}
