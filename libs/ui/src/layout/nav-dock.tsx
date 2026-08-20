/**
 * [UI/layout] The 64px icon rail. It renders navigation it is *given*:
 * items are data and the caller says which is active, so the dock never
 * imports a router and works in any app.
 */
import type * as React from "react";

import { cn } from "../lib/utils.ts";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip.tsx";

export interface NavDockItem {
  id: string;
  /** Shown in the tooltip and used as the accessible name. */
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Count shown as a small dot-badge; hidden when zero or undefined. */
  badge?: number;
}

/** Generic over the caller's item so ids keep their union, not `string`. */
export interface NavDockProps<TItem extends NavDockItem> {
  items: TItem[];
  /**
   * `| undefined` on purpose: "no item is active" is a real state, and
   * `exactOptionalPropertyTypes` separates omitted from passed-undefined.
   */
  activeId?: TItem["id"] | undefined;
  /** The app decides what a link is — `<Link>`, `<a>`, a button. */
  renderItem: (item: TItem, content: React.ReactNode) => React.ReactNode;
  /** Accessible name for the landmark — the app owns its words. */
  label?: string;
  /** Optional mark at the top of the dock. */
  brand?: React.ReactNode;
  /** Optional control pinned to the bottom — the account menu, in apps
   * that have one. Separate from `items` because it is not navigation:
   * it never takes part in `activeId`. */
  footer?: React.ReactNode;
  className?: string;
}

export function NavDock<TItem extends NavDockItem>({
  items,
  activeId,
  renderItem,
  brand,
  footer,
  label = "Main",
  className,
}: NavDockProps<TItem>) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "flex h-full w-16 flex-col items-center gap-1 border-r bg-card py-3",
        className,
      )}
    >
      {brand !== undefined && (
        <div className="mb-2 flex size-10 items-center justify-center">{brand}</div>
      )}

      {items.map((item) => (
        <Tooltip key={item.id}>
          <TooltipTrigger
            render={
              renderItem(
                item,
                <NavDockButtonContent item={item} isActive={item.id === activeId} />,
              ) as React.ReactElement
            }
          />
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      ))}

      {footer ? <div className="mt-auto">{footer}</div> : null}
    </nav>
  );
}

function NavDockButtonContent({
  item,
  isActive,
}: {
  item: NavDockItem;
  isActive: boolean;
}) {
  const Icon = item.icon;

  return (
    <span
      className={cn(
        "relative flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground",
        isActive && "bg-muted text-foreground",
      )}
    >
      <Icon className="size-5" />
      {item.badge !== undefined && (
        <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-medium text-primary-foreground">
          {item.badge}
        </span>
      )}
    </span>
  );
}
