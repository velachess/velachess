import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { usePanelRef, type PanelProps } from "react-resizable-panels";

import { SIDEBAR_MEDIA_QUERY, SIDEBAR_WIDTH } from "../lib/sidebar.ts";
import { cn } from "../lib/utils.ts";
import { ResizablePanel } from "./resizable.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.tsx";

const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type SidebarContextProps = {
  state: "expanded" | "collapsed";
  toggleSidebar: () => void;
  panelRef: ReturnType<typeof usePanelRef>;
  setCollapsed: (collapsed: boolean) => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}

/** The panel owns the width and whether it is collapsed; the provider only
 * mirrors the latter for the icon-only presentation. */
function SidebarProvider({ className, children, ...props }: React.ComponentProps<"div">) {
  const panelRef = usePanelRef();
  const [collapsed, setCollapsed] = React.useState(false);

  const context: SidebarContextProps = {
    state: collapsed ? "collapsed" : "expanded",
    toggleSidebar: () => {
      if (panelRef.current?.isCollapsed()) panelRef.current.expand();
      else panelRef.current?.collapse();
    },
    panelRef,
    setCollapsed,
  };

  // The panel reports its size from a ResizeObserver, a frame after the
  // first paint; reading it before then keeps a sidebar restored collapsed
  // from painting once with its labels.
  React.useLayoutEffect(() => {
    setCollapsed(panelRef.current?.isCollapsed() ?? false);
  }, [panelRef]);

  const onShortcut = React.useEffectEvent(context.toggleSidebar);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== SIDEBAR_KEYBOARD_SHORTCUT || !(event.metaKey || event.ctrlKey))
        return;
      if (!window.matchMedia(SIDEBAR_MEDIA_QUERY).matches) return;
      event.preventDefault();
      onShortcut();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <SidebarContext value={context}>
      <div
        data-slot="sidebar-wrapper"
        className={cn("flex min-h-svh w-full", className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext>
  );
}

function SidebarPanel(props: Omit<PanelProps, "id" | "panelRef" | "onResize">) {
  const { panelRef, setCollapsed } = useSidebar();

  return (
    <ResizablePanel
      id="sidebar"
      data-slot="sidebar-panel"
      panelRef={panelRef}
      collapsible
      collapsedSize={SIDEBAR_WIDTH.icon}
      minSize={SIDEBAR_WIDTH.min}
      maxSize={SIDEBAR_WIDTH.max}
      defaultSize={SIDEBAR_WIDTH.default}
      groupResizeBehavior="preserve-pixel-size"
      onResize={(size) => setCollapsed(size.inPixels < SIDEBAR_WIDTH.min)}
      style={{ overflow: "hidden" }}
      {...props}
    />
  );
}

function Sidebar({ className, ...props }: React.ComponentProps<"div">) {
  const { state } = useSidebar();

  return (
    <div
      data-slot="sidebar"
      data-state={state}
      className={cn(
        "group flex size-full flex-col bg-sidebar text-sidebar-foreground",
        className,
      )}
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "no-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-auto group-data-[state=collapsed]:overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button group/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden transition-[width,height,padding] group-data-[state=collapsed]:size-8! group-data-[state=collapsed]:p-2! hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground motion-reduce:transition-none [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate",
  {
    variants: {
      size: {
        default: "h-8 text-sm",
        lg: "h-12 text-sm group-data-[state=collapsed]:p-0!",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

function SidebarMenuButton({
  render,
  isActive = false,
  size = "default",
  tooltip,
  className,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    isActive?: boolean;
    tooltip?: string;
  } & VariantProps<typeof sidebarMenuButtonVariants>) {
  const { state } = useSidebar();
  let trigger = render;
  if (tooltip !== undefined) trigger = <TooltipTrigger render={render} />;

  const button = useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      { className: cn(sidebarMenuButtonVariants({ size }), className) },
      props,
    ),
    render: trigger,
    state: {
      slot: "sidebar-menu-button",
      sidebar: "menu-button",
      size,
      active: isActive,
    },
  });

  if (tooltip === undefined) {
    return button;
  }

  return (
    <Tooltip>
      {button}
      <TooltipContent side="right" align="center" hidden={state !== "collapsed"}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarMenuBadge({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        "pointer-events-none absolute top-1.5 right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none group-data-[state=collapsed]:hidden peer-hover/menu-button:text-sidebar-accent-foreground peer-data-active/menu-button:text-sidebar-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarPanel,
  SidebarProvider,
  useSidebar,
};
