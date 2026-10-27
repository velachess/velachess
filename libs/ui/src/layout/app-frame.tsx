/**
 * Navigation through the `nav` slot, content as children:
 *   >= 768px  sidebar, resizable and collapsible to icons | content
 *   < 768px   sidebar hidden, `navFallback` below the content as a bottom bar,
 *             by flex order rather than fixed positioning
 */
import type * as React from "react";

import { cn } from "../lib/utils.ts";
import { SidebarProvider } from "../components/sidebar.tsx";

type SidebarPreference = Required<
  Pick<
    React.ComponentProps<typeof SidebarProvider>,
    "open" | "onOpenChange" | "width" | "onWidthChange"
  >
>;

export interface AppFrameProps extends SidebarPreference {
  /** The persistent navigation, hidden on small screens. */
  nav: React.ReactNode;
  /** Shown instead of `nav` below the sidebar breakpoint. */
  navFallback?: React.ReactNode;
  /** A strip above the content. */
  banner?: React.ReactNode;
  /** Label of the skip link. */
  skipLabel?: string;
  children: React.ReactNode;
  className?: string;
}

const SKIP_TARGET_ID = "app-frame-main";

export function AppFrame({
  nav,
  navFallback,
  banner,
  skipLabel = "Skip to content",
  children,
  className,
  ...sidebar
}: AppFrameProps) {
  return (
    <SidebarProvider
      {...sidebar}
      className={cn("h-svh overflow-hidden bg-background", className)}
    >
      <a
        href={`#${SKIP_TARGET_ID}`}
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        {skipLabel}
      </a>

      {nav}

      <div className="flex min-w-0 flex-1 flex-col">
        {banner}
        <main
          id={SKIP_TARGET_ID}
          className="@container/content flex min-h-0 flex-1 flex-col"
        >
          {children}
        </main>
        {navFallback ? <div className="md:hidden">{navFallback}</div> : null}
      </div>
    </SidebarProvider>
  );
}
