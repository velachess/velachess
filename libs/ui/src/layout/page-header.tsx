/**
 * [UI/layout] The top of a screen: where it sits, what it is, and what you
 * can do to it. Breadcrumbs, actions and the bottom bar arrive through
 * slots so the header never grows a product-specific control.
 */
import type * as React from "react";

import { cn } from "../lib/utils.ts";

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  /** A fact about the screen, right of the title: a count, a status. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /** Full width under the title row: filters, a search, tabs. */
  bottom?: React.ReactNode;
  /** A smaller title and description, for a screen whose content needs the height. */
  compact?: boolean;
  className?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  meta,
  actions,
  bottom,
  compact = false,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex shrink-0 flex-col gap-2 border-b px-4 py-4 md:px-6",
        compact && "py-3",
        className,
      )}
    >
      {breadcrumbs}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-xs flex-col gap-1">
          <h1
            className={cn(
              "text-2xl/7 font-semibold wrap-break-word",
              compact && "text-xl/6",
            )}
          >
            {title}
          </h1>
          {description !== undefined && (
            <p className={cn("text-sm/5 text-muted-foreground", compact && "text-xs/4")}>
              {description}
            </p>
          )}
        </div>
        {meta !== undefined && <div className="shrink-0">{meta}</div>}
        {actions !== undefined && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {bottom !== undefined && <div className="pt-2">{bottom}</div>}
    </header>
  );
}
