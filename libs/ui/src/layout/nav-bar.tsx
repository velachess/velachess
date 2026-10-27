import { Fragment } from "react";
import type * as React from "react";

import { cn } from "../lib/utils.ts";
import type { NavItem } from "./nav-sidebar.tsx";

export interface NavBarProps<TItem extends NavItem> {
  items: TItem[];
  /** `| undefined` because no active item is a real state, which
   * `exactOptionalPropertyTypes` tells apart from omitted. */
  activeId?: TItem["id"] | undefined;
  /** Give the returned element `className="contents"`, so the slot below
   * rather than the link is what `nav`'s flexbox sizes. */
  renderItem: (item: TItem, content: React.ReactNode) => React.ReactNode;
  label?: string;
  /** Separate from `items` because it is not navigation: it never takes
   * part in `activeId`. */
  footer?: React.ReactNode;
  className?: string;
}

export function NavBar<TItem extends NavItem>({
  items,
  activeId,
  renderItem,
  footer,
  label = "Main",
  className,
}: NavBarProps<TItem>) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "flex items-center gap-1 border-t bg-card px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {items.map((item) => (
        <Fragment key={item.id}>
          {renderItem(
            item,
            <NavBarItemContent item={item} isActive={item.id === activeId} />,
          )}
        </Fragment>
      ))}

      {footer ? <div className="ml-auto flex items-center">{footer}</div> : null}
    </nav>
  );
}

function NavBarItemContent({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;

  return (
    <span className="flex flex-1 items-center justify-center py-1">
      <span
        data-active={isActive}
        className={cn(
          "flex h-14 w-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-2xl text-muted-foreground transition-colors",
          "hover:bg-muted hover:text-foreground",
          "data-[active=true]:bg-muted data-[active=true]:text-foreground",
        )}
      >
        <span className="relative flex size-8 items-center justify-center">
          <Icon className="size-5" />
          {item.badge !== undefined && (
            <span className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-medium text-primary-foreground">
              {item.badge}
            </span>
          )}
        </span>
        <span className="text-[10px] leading-none font-medium">{item.label}</span>
      </span>
    </span>
  );
}
