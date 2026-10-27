/**
 * The desktop navigation renders what it is given: items are data and the
 * caller says which is active, so it never imports a router. Collapsing to
 * icons and resizing belong to the sidebar primitive underneath.
 */
import type * as React from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "../components/sidebar.tsx";

export interface NavItem {
  id: string;
  /** The label, the collapsed tooltip, and the accessible name. */
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

/** Generic over the caller's item, so ids keep their union. */
export interface NavSidebarProps<TItem extends NavItem> {
  items: TItem[];
  /** `| undefined` because no active item is a real state, which
   * `exactOptionalPropertyTypes` tells apart from omitted. */
  activeId?: TItem["id"] | undefined;
  /** Becomes the menu button, so it returns the link element itself. */
  renderItem: (item: TItem, content: React.ReactNode) => React.ReactElement;
  /** Accessible name for the landmark. */
  label?: string;
  /** Accessible name for the resize handle. */
  resizeLabel: string;
  header: React.ReactNode;
  /** Separate from `items` because it is not navigation: it never takes
   * part in `activeId`. */
  footer: React.ReactNode;
}

export function NavSidebar<TItem extends NavItem>({
  items,
  activeId,
  renderItem,
  label = "Main",
  resizeLabel,
  header,
  footer,
}: NavSidebarProps<TItem>) {
  return (
    <Sidebar>
      <nav aria-label={label} className="flex min-h-0 flex-1 flex-col">
        <SidebarHeader>{header}</SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={item.id === activeId}
                    tooltip={item.label}
                    render={renderItem(item, <NavSidebarItemContent item={item} />)}
                  />
                  {item.badge !== undefined && (
                    <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>{footer}</SidebarFooter>
      </nav>
      <SidebarRail aria-label={resizeLabel} />
    </Sidebar>
  );
}

function NavSidebarItemContent({ item }: { item: NavItem }) {
  const Icon = item.icon;

  return (
    <>
      <Icon />
      <span>{item.label}</span>
    </>
  );
}
