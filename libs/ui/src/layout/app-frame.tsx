/**
 * Navigation through the `nav` slot, content as children:
 *   >= 768px  sidebar, resizable and collapsible to icons | content
 *   < 768px   sidebar hidden, `navFallback` below the content as a bottom bar,
 *             by flex order rather than fixed positioning
 */
import type * as React from "react";
import { useDefaultLayout } from "react-resizable-panels";

import { cn } from "../lib/utils.ts";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../components/resizable.tsx";
import { SidebarPanel, SidebarProvider } from "../components/sidebar.tsx";

export interface AppFrameProps {
  nav: React.ReactNode;
  /** Shown instead of `nav` below the sidebar breakpoint. */
  navFallback?: React.ReactNode;
  banner?: React.ReactNode;
  skipLabel?: string;
  resizeLabel: string;
  /** Where the sidebar's width and collapsed state are remembered. */
  layoutId: string;
  children: React.ReactNode;
  className?: string;
}

const SKIP_TARGET_ID = "app-frame-main";

export function AppFrame({
  nav,
  navFallback,
  banner,
  skipLabel = "Skip to content",
  resizeLabel,
  layoutId,
  children,
  className,
}: AppFrameProps) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: layoutId });

  return (
    <SidebarProvider className={cn("h-svh overflow-hidden bg-background", className)}>
      <a
        href={`#${SKIP_TARGET_ID}`}
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        {skipLabel}
      </a>

      <ResizablePanelGroup
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="max-md:*:data-[slot=resizable-handle]:hidden! max-md:*:data-[slot=sidebar-panel]:hidden!"
      >
        <SidebarPanel>{nav}</SidebarPanel>
        <ResizableHandle
          withHandle
          aria-label={resizeLabel}
          className="bg-sidebar-border"
        />
        <ResizablePanel id="content" className="flex min-w-0 flex-col">
          {banner}
          <main
            id={SKIP_TARGET_ID}
            className="@container/content flex min-h-0 flex-1 flex-col"
          >
            {children}
          </main>
          {navFallback ? <div className="md:hidden">{navFallback}</div> : null}
        </ResizablePanel>
      </ResizablePanelGroup>
    </SidebarProvider>
  );
}
