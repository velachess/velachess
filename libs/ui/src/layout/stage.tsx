/**
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
  /** In px. */
  width?: number;
  hasDivider?: boolean;
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
  const asideStyle: React.CSSProperties & Record<"--aside-width", string> = {
    "--aside-width": `${width}px`,
  };

  return (
    <>
      {hasDivider && <Separator orientation="vertical" className="hidden lg:block" />}
      <aside
        aria-label={label}
        style={asideStyle}
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
