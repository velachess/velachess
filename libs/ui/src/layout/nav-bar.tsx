/**
 * [UI/layout] The mobile bottom tab bar — `NavDock`'s horizontal sibling,
 * shown through `AppFrame`'s `navFallback` slot below the rail breakpoint.
 * Touch has no hover, so the label sits under the icon instead of in a
 * tooltip; otherwise it takes the same data-in, router-free shape as
 * `NavDock` so a caller builds both from one `items` array.
 *
 * Each item gets an equal-width slot (`flex-1`) that is the full tap
 * target; the selected pill inside it is a fixed box, sized the same for
 * every item regardless of label length, so switching tabs never shifts
 * the highlight's width. `renderItem`'s link must not generate its own
 * box (`display: contents`) — otherwise it, not this slot, would be the
 * flex item `nav` sizes, and the fixed-width pill would go back to
 * shrink-wrapping the label.
 */
import type * as React from "react";

import { cn } from "../lib/utils.ts";
import type { NavDockItem } from "./nav-dock.tsx";

/** Generic over the caller's item so ids keep their union, not `string`. */
export interface NavBarProps<TItem extends NavDockItem> {
  items: TItem[];
  /**
   * `| undefined` on purpose: "no item is active" is a real state, and
   * `exactOptionalPropertyTypes` separates omitted from passed-undefined.
   */
  activeId?: TItem["id"] | undefined;
  /** The app decides what a link is — `<Link>`, `<a>`, a button. Give it
   * `className="contents"` so the slot below, not the link, is what
   * `nav`'s flexbox sizes. */
  renderItem: (item: TItem, content: React.ReactNode) => React.ReactNode;
  /** Accessible name for the landmark — the app owns its words. */
  label?: string;
  /** Optional control trailing the items — the account menu, in apps
   * that have one. Separate from `items` because it is not navigation:
   * it never takes part in `activeId`. */
  footer?: React.ReactNode;
  className?: string;
}

export function NavBar<TItem extends NavDockItem>({
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
      {items.map((item) =>
        renderItem(
          item,
          <NavBarItemContent item={item} isActive={item.id === activeId} />,
        ),
      )}

      {footer ? <div className="ml-auto flex items-center">{footer}</div> : null}
    </nav>
  );
}

function NavBarItemContent({ item, isActive }: { item: NavDockItem; isActive: boolean }) {
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
