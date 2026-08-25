"use client";

import { Moon, Sun } from "@velachess/ui/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

const THEME_STORAGE_KEY = "velachess-theme";

export function ThemeToggle({
  switchToLightLabel,
  switchToDarkLabel,
}: {
  switchToLightLabel: string;
  switchToDarkLabel: string;
}) {
  const [isDark, setIsDark] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const updateTheme = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const toggleTheme = useCallback(async () => {
    const button = buttonRef.current;
    if (button === null) return;

    const applyTheme = () => {
      const nextTheme = isDark ? "light" : "dark";
      flushSync(() => setIsDark(!isDark));
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(nextTheme);
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    };

    if (document.startViewTransition === undefined) {
      applyTheme();
      return;
    }

    const transition = document.startViewTransition(applyTheme);
    await transition.ready;
    const { top, left, width, height } = button.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const radius = Math.hypot(
      Math.max(left, window.innerWidth - left),
      Math.max(top, window.innerHeight - top),
    );
    document.documentElement.animate(
      {
        clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
      },
      {
        duration: 400,
        easing: "ease-in-out",
        pseudoElement: "::view-transition-new(root)",
      },
    );
  }, [isDark]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? switchToLightLabel : switchToDarkLabel}
      className="flex size-8 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
    >
      {isDark && <Sun className="size-4" />}
      {!isDark && <Moon className="size-4" />}
    </button>
  );
}
