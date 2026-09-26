"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";

import { cn } from "../lib/utils.ts";

/**
 * A single-value range input. Composes its own track, indicator and thumb,
 * so a caller writes `<Slider min max step value onValueChange />` and
 * nothing else — the parts stay exported for the rare layout that needs
 * them, matching how Progress is built.
 */
function Slider({ className, children, ...props }: SliderPrimitive.Root.Props) {
  return (
    <SliderPrimitive.Root data-slot="slider" {...props}>
      <SliderPrimitive.Control
        className={cn("flex w-full touch-none items-center py-2", className)}
        data-slot="slider-control"
      >
        {children ?? (
          <SliderTrack>
            <SliderIndicator />
            <SliderThumb />
          </SliderTrack>
        )}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

function SliderTrack({ className, ...props }: SliderPrimitive.Track.Props) {
  return (
    <SliderPrimitive.Track
      data-slot="slider-track"
      className={cn("relative h-1.5 w-full select-none rounded-full bg-muted", className)}
      {...props}
    />
  );
}

function SliderIndicator({ className, ...props }: SliderPrimitive.Indicator.Props) {
  return (
    <SliderPrimitive.Indicator
      data-slot="slider-indicator"
      className={cn("select-none rounded-full bg-primary", className)}
      {...props}
    />
  );
}

function SliderThumb({ className, ...props }: SliderPrimitive.Thumb.Props) {
  return (
    <SliderPrimitive.Thumb
      data-slot="slider-thumb"
      className={cn(
        // size-4 keeps the visual thumb small; the control's py-2 is what
        // gives it a touch target taller than the track.
        "size-4 select-none rounded-full bg-primary shadow-sm transition-[color,box-shadow]",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function SliderValue({ className, ...props }: SliderPrimitive.Value.Props) {
  return (
    <SliderPrimitive.Value
      data-slot="slider-value"
      className={cn("text-sm text-muted-foreground tabular-nums", className)}
      {...props}
    />
  );
}

export { Slider, SliderTrack, SliderIndicator, SliderThumb, SliderValue };
