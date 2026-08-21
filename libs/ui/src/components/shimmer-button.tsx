import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { CSSProperties } from "react";

import { cn } from "../lib/utils.ts";

type ShimmerButtonProps = useRender.ComponentProps<"button"> & {
  shimmerColor?: string;
  shimmerSize?: string;
  shimmerDuration?: string;
};

function ShimmerButton({
  shimmerColor = "var(--primary-foreground)",
  shimmerSize = "0.05em",
  shimmerDuration = "3s",
  className,
  children,
  render,
  style,
  ...props
}: ShimmerButtonProps) {
  const shimmerStyle = {
    "--spread": "90deg",
    "--shimmer-color": shimmerColor,
    "--speed": shimmerDuration,
    "--cut": shimmerSize,
    ...style,
  } as CSSProperties & Record<`--${string}`, string | number>;

  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "group relative z-0 flex cursor-pointer items-center justify-center overflow-hidden rounded-full border border-foreground/10 bg-primary px-6 py-3 whitespace-nowrap text-primary-foreground",
          "transform-gpu transition-transform duration-300 ease-in-out active:translate-y-px",
          className,
        ),
        children: (
          <>
            <span className="absolute inset-0 -z-30 overflow-visible blur-[2px] [container-type:size]">
              <span className="animate-shimmer-slide absolute inset-0 h-[100cqh] [aspect-ratio:1] [border-radius:0] [mask:none]">
                <span className="animate-spin-around absolute -inset-full w-auto rotate-0 [translate:0_0] [background:conic-gradient(from_calc(270deg-(var(--spread)*0.5)),transparent_0,var(--shimmer-color)_var(--spread),transparent_var(--spread))]" />
              </span>
            </span>
            {children}
            <span className="absolute inset-0 size-full rounded-2xl px-4 py-1.5 text-sm font-medium shadow-[inset_0_-8px_10px_color-mix(in_oklab,var(--primary-foreground)_12%,transparent)] transition-shadow duration-300 ease-in-out group-hover:shadow-[inset_0_-6px_10px_color-mix(in_oklab,var(--primary-foreground)_25%,transparent)] group-active:shadow-[inset_0_-10px_10px_color-mix(in_oklab,var(--primary-foreground)_25%,transparent)]" />
            <span className="absolute inset-[var(--cut)] -z-20 rounded-full bg-primary" />
          </>
        ),
        style: shimmerStyle,
      },
      props,
    ),
    render,
    state: { slot: "shimmer-button" },
  });
}

export { ShimmerButton };
