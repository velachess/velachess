"use client";

import { cn } from "@velachess/ui/lib/utils";
import type { ComponentPropsWithoutRef, ElementType } from "react";
import { useEffect, useRef, useState } from "react";

export function Reveal<T extends ElementType = "div">({
  as,
  amount = 0.3,
  delayMs = 0,
  durationMs = 600,
  distancePx = 30,
  className,
  style,
  children,
  ...props
}: {
  as?: T;
  amount?: number;
  delayMs?: number;
  durationMs?: number;
  distancePx?: number;
} & ComponentPropsWithoutRef<T>) {
  const Component: ElementType = as ?? "div";
  const ref = useRef<Element>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: amount },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [amount]);

  return (
    <Component
      ref={ref}
      data-motion-reveal
      style={{
        ...style,
        transitionDuration: `${durationMs}ms`,
        transitionDelay: `${delayMs}ms`,
        transform: revealed ? "none" : `translateY(${distancePx}px)`,
      }}
      className={cn(
        "transition-[opacity,transform] ease-[cubic-bezier(0.22,1,0.36,1)]",
        revealed ? "opacity-100" : "opacity-0",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
