/**
 * [UI/layout] The top of a screen: what this page is, and what you can do
 * to it. Actions arrive through a slot so the header never grows a
 * product-specific button.
 */
import type * as React from "react";

import { cn } from "../lib/utils.ts";

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Primary and secondary actions for the page. */
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b px-6 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-lg font-medium">{title}</h1>
        {description !== undefined && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
