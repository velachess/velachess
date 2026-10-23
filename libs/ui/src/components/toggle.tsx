import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils.ts";

/**
 * Selected must not look like hovered: `aria-pressed:bg-muted` beside
 * `hover:bg-muted` made a chosen filter look like whichever chip the
 * pointer was over. Pressed takes the accent, which is legible at rest,
 * and hover only deepens it.
 *
 * Base UI emits `aria-pressed`/`data-pressed`; `data-[state=on]` is
 * Radix's and does nothing here.
 */
const PRESSED =
  "aria-pressed:bg-primary/10 aria-pressed:text-primary aria-pressed:hover:bg-primary/15 aria-pressed:hover:text-primary";

const toggleVariants = cva(
  `group/toggle inline-flex items-center justify-center gap-1 rounded-lg text-sm font-medium whitespace-nowrap transition-all outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 ${PRESSED}`,
  {
    variants: {
      variant: {
        default: "bg-transparent",
        // After the variant's own hover, so tailwind-merge keeps the pressed
        // rules last and a re-stated `hover:bg-*` cannot wash the selection
        // out.
        outline: `border border-input bg-transparent hover:bg-muted aria-pressed:border-primary ${PRESSED}`,
      },
      size: {
        default:
          "h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        sm: "h-7 min-w-7 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
