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

/** `setTheme`, wrapped in the circular view-transition reveal anchored to
 * whatever visible element `anchorRef` points at. Falls back to an
 * unanimated update where View Transitions aren't supported. */
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

/** The System/Light/Dark options, with no trigger of their own — embed
 * inside any `DropdownMenuContent` or `DropdownMenuSubContent`. `anchorRef`
 * is whatever visible element the caller wants the reveal to spread from
 * (its own trigger, or a submenu trigger). */
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

/** Self-contained trigger + menu for anywhere that isn't already inside
 * another menu (a page header, not an account dropdown). */
export function ThemeToggle({
  labels,
}: {
  labels: { toggle: string; system: string; light: string; dark: string };
}) {
  const { resolvedTheme } = useTheme();
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
        {resolvedTheme === "dark" ? (
          <Moon className="size-4" />
        ) : (
          <Sun className="size-4" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ThemeRadioItems labels={labels} anchorRef={triggerRef} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
