/**
 * [UI/layout] The working area: a main region and an optional aside for
 * detail. Selecting something fills the aside instead of replacing the
 * page, and the aside's width is an explicit budget so the main region
 * never jumps when the detail changes.
 *
 * Responsive contract:
 *   > 1024px   main | aside (width prop)
 *   <= 1024px  aside drops below main instead of squeezing it
 */
import type * as React from "react";

import { cn } from "../lib/utils.ts";
import { Separator } from "../components/separator.tsx";

export function Stage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col lg:flex-row", className)}>
      {children}
    </div>
  );
}

export function StageMain({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col overflow-auto", className)}>
      {children}
    </div>
  );
}

export interface StageAsideProps {
  children: React.ReactNode;
  /** Width budget in px. Kept explicit so regions are decided, not emergent. */
  width?: number;
  hasDivider?: boolean;
  /** Accessible name for the region. */
  label: string;
  className?: string;
}

export function StageAside({
  children,
  width = 380,
  hasDivider = true,
  label,
  className,
}: StageAsideProps) {
  return (
    <>
      {hasDivider && <Separator orientation="vertical" className="hidden lg:block" />}
      <aside
        aria-label={label}
        // The budget travels as a variable so the class stays static.
        style={{ "--aside-width": `${width}px` } as React.CSSProperties}
        className={cn(
          "flex w-full shrink-0 flex-col overflow-auto lg:w-(--aside-width)",
          className,
        )}
      >
        {children}
      </aside>
    </>
  );
}
