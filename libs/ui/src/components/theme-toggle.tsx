"use client";

import { useRef, type RefObject } from "react";
import { flushSync } from "react-dom";

import { Monitor, Moon, Sun } from "../icons/index.ts";
import { useTheme } from "../lib/theme-provider.tsx";
import type { Theme } from "../lib/theme.ts";
import { Button } from "./button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./dropdown-menu.tsx";

/** `setTheme` wrapped in the circular reveal anchored to `anchorRef`,
 * falling back to an unanimated update without View Transitions. */
function useAnimatedSetTheme(anchorRef: RefObject<HTMLElement | null>) {
  const { setTheme } = useTheme();

  return (next: Theme) => {
    const apply = () => flushSync(() => setTheme(next));

    if (document.startViewTransition === undefined) {
      apply();
      return;
    }

    const anchor = anchorRef.current;
    const transition = document.startViewTransition(apply);
    if (anchor === null) return;

    void transition.ready.then(() => {
      const { top, left, width, height } = anchor.getBoundingClientRect();
      const x = left + width / 2;
      const y = top + height / 2;
      const radius = Math.hypot(
        Math.max(left, window.innerWidth - left),
        Math.max(top, window.innerHeight - top),
      );
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0 at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 400,
          easing: "ease-in-out",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    });
  };
}

/** The options with no trigger of their own, for embedding in any
 * `DropdownMenuContent`. `anchorRef` is the element the reveal spreads
 * from. */
export function ThemeRadioItems({
  labels,
  anchorRef,
}: {
  labels: { system: string; light: string; dark: string };
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const { theme } = useTheme();
  const selectTheme = useAnimatedSetTheme(anchorRef);

  return (
    <DropdownMenuRadioGroup
      value={theme}
      onValueChange={(value) => selectTheme(value as Theme)}
    >
      <DropdownMenuRadioItem value="system">
        <Monitor className="size-4" />
        {labels.system}
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="light">
        <Sun className="size-4" />
        {labels.light}
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="dark">
        <Moon className="size-4" />
        {labels.dark}
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  );
}

/** Trigger and menu together, for anywhere not already inside another
 * menu. */
export function ThemeToggle({
  labels,
}: {
  labels: { toggle: string; system: string; light: string; dark: string };
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon"
            aria-label={labels.toggle}
          />
        }
      >
        {/* CSS picks the icon: a static export cannot know the theme, and
            rendering it from state failed hydration for every light visitor. */}
        <Sun className="size-4 dark:hidden" />
        <Moon className="hidden size-4 dark:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ThemeRadioItems labels={labels} anchorRef={triggerRef} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
