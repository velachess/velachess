"use client";

import { msg } from "@lingui/core/macro";
import { buttonVariants } from "@velachess/ui/components/button";
import { Menu, Moon, Sun, VelaChessMark, X } from "@velachess/ui/icons";
import { cn } from "@velachess/ui/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { i18n } from "../shared/i18n.ts";

const PRODUCT_URL = "https://app.velachess.com";
const THEME_STORAGE_KEY = "velachess-theme";

const COPY = {
  brand: msg`VelaChess`,
  product: msg`Product`,
  howItWorks: msg`How it works`,
  getStarted: msg`Get Started`,
  menu: msg`Open navigation`,
  closeMenu: msg`Close navigation`,
  switchLight: msg`Switch to light theme`,
  switchDark: msg`Switch to dark theme`,
} as const;

const NAVIGATION = [
  { href: "#product", label: COPY.product },
  { href: "#how-it-works", label: COPY.howItWorks },
] as const;

export function LandingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      aria-label={i18n._(COPY.menu)}
      data-state={menuOpen ? "active" : undefined}
      className="fixed z-20 w-full px-2"
    >
      <div
        className={cn(
          "mx-auto mt-2 max-w-6xl px-6 transition-colors duration-300 lg:px-12",
          isScrolled &&
            "max-w-4xl rounded-full border bg-background/50 backdrop-blur-lg lg:px-6",
        )}
      >
        <div className="relative flex flex-wrap items-center justify-between gap-6 py-2 lg:gap-0 lg:py-2.5">
          <div className="flex w-full justify-between lg:w-auto">
            <Brand />
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-label={i18n._(menuOpen ? COPY.closeMenu : COPY.menu)}
              onClick={() => setMenuOpen((open) => !open)}
              className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden"
            >
              <Menu className="in-data-[state=active]:rotate-180 in-data-[state=active]:scale-0 in-data-[state=active]:opacity-0 m-auto size-6 duration-200" />
              <X className="in-data-[state=active]:rotate-0 in-data-[state=active]:scale-100 in-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200" />
            </button>
          </div>

          <div className="absolute inset-0 m-auto hidden size-fit lg:block">
            <ul className="flex gap-8 text-sm">
              {NAVIGATION.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="block text-base text-muted-foreground duration-150 hover:text-foreground"
                  >
                    {i18n._(item.label)}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="in-data-[state=active]:block lg:in-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border bg-background p-6 shadow-2xl shadow-foreground/10 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none">
            <div className="w-full lg:hidden">
              <ul className="space-y-6 text-base">
                {NAVIGATION.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className="block text-muted-foreground duration-150 hover:text-foreground"
                    >
                      {i18n._(item.label)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
              <ThemeToggle />
              <a
                href={PRODUCT_URL}
                className={buttonVariants({
                  className: "h-8 rounded-full px-3 text-sm lg:inline-flex",
                  size: "sm",
                })}
              >
                {i18n._(COPY.getStarted)}
              </a>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

function Brand() {
  return (
    <a
      href="#top"
      className="flex items-center space-x-2"
      aria-label={i18n._(COPY.brand)}
    >
      <span className="header-brand-mark flex size-9 items-center justify-center rounded-lg bg-primary">
        <VelaChessMark className="size-6" />
      </span>
      <span className="font-display text-lg font-semibold">{i18n._(COPY.brand)}</span>
    </a>
  );
}

function ThemeToggle() {
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
      aria-label={i18n._(isDark ? COPY.switchLight : COPY.switchDark)}
      className="flex size-8 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
    >
      {isDark && <Sun className="size-4" />}
      {!isDark && <Moon className="size-4" />}
    </button>
  );
}
