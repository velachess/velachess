import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../lib/utils.ts";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.tsx";

export const SIDEBAR_WIDTH = { min: 208, default: 256, max: 352 } as const;
const SIDEBAR_WIDTH_ICON = 48;
const SIDEBAR_COLLAPSE_BELOW = (SIDEBAR_WIDTH_ICON + SIDEBAR_WIDTH.min) / 2;
const SIDEBAR_KEYBOARD_STEP = 16;
const SIDEBAR_KEYBOARD_SHORTCUT = "b";
const SIDEBAR_DRAG_SLOP = 2;

type SidebarContextProps = {
  state: ReturnType<typeof sidebarState>;
  open: boolean;
  setOpen: (open: boolean) => void;
  width: number;
  setWidth: (width: number) => void;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}

function clampWidth(width: number) {
  return Math.min(Math.max(width, SIDEBAR_WIDTH.min), SIDEBAR_WIDTH.max);
}

function sidebarState(open: boolean) {
  if (open) return "expanded";
  return "collapsed";
}

function visibleWidth(open: boolean, width: number) {
  if (open) return width;
  return SIDEBAR_WIDTH_ICON;
}

function SidebarProvider({
  open,
  onOpenChange: setOpen,
  width: widthProp,
  onWidthChange: setWidth,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "style"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The expanded width in px; clamped, so a stale persisted value is safe. */
  width: number;
  onWidthChange: (width: number) => void;
}) {
  const width = clampWidth(widthProp);

  function toggleSidebar() {
    setOpen(!open);
  }

  const dimensions: Record<`--${string}`, string> = {
    "--sidebar-width": `${width}px`,
    "--sidebar-width-icon": `${SIDEBAR_WIDTH_ICON}px`,
  };

  const onShortcut = React.useEffectEvent(toggleSidebar);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== SIDEBAR_KEYBOARD_SHORTCUT || !(event.metaKey || event.ctrlKey))
        return;
      event.preventDefault();
      onShortcut();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <SidebarContext
      value={{
        state: sidebarState(open),
        open,
        setOpen,
        width,
        setWidth,
        toggleSidebar,
      }}
    >
      <div
        data-slot="sidebar-wrapper"
        style={dimensions}
        className={cn(
          "group/sidebar-wrapper flex min-h-svh w-full data-resizing:cursor-ew-resize data-resizing:select-none",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </SidebarContext>
  );
}

function Sidebar({ className, children, ...props }: React.ComponentProps<"div">) {
  const { state } = useSidebar();

  return (
    <div
      className="group peer hidden text-sidebar-foreground md:block"
      data-state={state}
      data-slot="sidebar"
    >
      <div
        data-slot="sidebar-gap"
        className="relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear group-data-[state=collapsed]:w-(--sidebar-width-icon) in-data-resizing:transition-none motion-reduce:transition-none"
      />
      <div
        data-slot="sidebar-container"
        className={cn(
          "fixed inset-y-0 left-0 z-10 hidden h-svh w-(--sidebar-width) border-r border-sidebar-border transition-[width] duration-200 ease-linear group-data-[state=collapsed]:w-(--sidebar-width-icon) in-data-resizing:transition-none motion-reduce:transition-none md:flex",
          className,
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="flex size-full flex-col bg-sidebar"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

interface RailDrag {
  wrapper: HTMLElement;
  startX: number;
  startWidth: number;
  width: number;
  moved: boolean;
}

/**
 * A window splitter: drag or arrow keys resize, Enter or a click toggles.
 * The width is previewed on the wrapper's variable while dragging and
 * committed once on release, so a drag does not re-render the tree.
 */
function SidebarRail({ className, ...props }: React.ComponentProps<"div">) {
  const { open, setOpen, width, setWidth, toggleSidebar } = useSidebar();
  const dragRef = React.useRef<RailDrag | null>(null);

  function preview(drag: RailDrag, next: number) {
    drag.width = next;
    drag.wrapper.style.setProperty("--sidebar-width", `${next}px`);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const wrapper = event.currentTarget.closest<HTMLElement>(
      "[data-slot=sidebar-wrapper]",
    );
    if (event.button !== 0 || !wrapper) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      wrapper,
      startX: event.clientX,
      startWidth: visibleWidth(open, width),
      width,
      moved: false,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;

    const offset = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(offset) <= SIDEBAR_DRAG_SLOP) return;
    drag.moved = true;
    drag.wrapper.dataset["resizing"] = "";

    const pointerWidth = drag.startWidth + offset;
    if (pointerWidth < SIDEBAR_COLLAPSE_BELOW) {
      if (open) setOpen(false);
      preview(drag, width);
      return;
    }

    if (!open) setOpen(true);
    preview(drag, clampWidth(pointerWidth));
  }

  function finishDrag() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return null;

    delete drag.wrapper.dataset["resizing"];
    if (drag.moved && drag.width !== width) setWidth(drag.width);
    return drag;
  }

  function handlePointerUp() {
    const drag = finishDrag();
    if (drag && !drag.moved) toggleSidebar();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      toggleSidebar();
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setWidth(clampWidth(width + SIDEBAR_KEYBOARD_STEP));
      return;
    }

    if (event.key === "ArrowLeft" && open) {
      event.preventDefault();
      if (width <= SIDEBAR_WIDTH.min) {
        setOpen(false);
        return;
      }
      setWidth(clampWidth(width - SIDEBAR_KEYBOARD_STEP));
    }
  }

  return (
    <div
      data-sidebar="rail"
      data-slot="sidebar-rail"
      role="separator"
      aria-orientation="vertical"
      aria-valuemin={SIDEBAR_WIDTH_ICON}
      aria-valuemax={SIDEBAR_WIDTH.max}
      aria-valuenow={visibleWidth(open, width)}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={finishDrag}
      onKeyDown={handleKeyDown}
      className={cn(
        "absolute inset-y-0 -right-4 z-20 flex w-4 -translate-x-1/2 cursor-ew-resize touch-none outline-hidden after:absolute after:inset-y-0 after:start-1/2 after:w-0.5 after:transition-colors hover:after:bg-sidebar-border focus-visible:after:bg-sidebar-ring in-data-resizing:after:bg-sidebar-ring motion-reduce:after:transition-none",
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
  SidebarProvider,
  SidebarRail,
  useSidebar,
};
