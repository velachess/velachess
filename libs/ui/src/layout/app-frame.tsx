/**
 * [UI/layout] Outermost frame — nav via the `nav` slot, content as
 * children. Responsive contract:
 *   > 768px   nav rail 64 | content
 *   <= 768px  rail hidden; `navFallback` renders below the content, as a
 *             bottom bar — plain flex order, not fixed positioning
 */
import type * as React from "react";

import { cn } from "../lib/utils.ts";

export interface AppFrameProps {
  /** Structural slot: the persistent navigation, hidden on small screens. */
  nav: React.ReactNode;
  /** Shown instead of `nav` below the rail breakpoint. */
  navFallback?: React.ReactNode;
  /** Full-width strip above everything — sync warnings, offline notice. */
  banner?: React.ReactNode;
  /** Label of the skip link — the app owns its words. */
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
}: AppFrameProps) {
  return (
    <div
      className={cn(
        "flex h-svh w-full flex-col overflow-hidden bg-background",
        className,
      )}
    >
      <a
        href={`#${SKIP_TARGET_ID}`}
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        {skipLabel}
      </a>

      {banner}

      <div className="flex min-h-0 flex-1">
        <div className="hidden md:block">{nav}</div>

        <div className="flex min-w-0 flex-1 flex-col">
          <main
            id={SKIP_TARGET_ID}
            className="@container/content flex min-h-0 flex-1 flex-col"
          >
            {children}
          </main>
          {navFallback ? <div className="md:hidden">{navFallback}</div> : null}
        </div>
      </div>
    </div>
  );
}
