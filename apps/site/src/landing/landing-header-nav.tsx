"use client";

import { Menu, X } from "@velachess/ui/icons";
import { cn } from "@velachess/ui/lib/utils";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export function LandingHeaderNav({
  menuLabel,
  closeMenuLabel,
  brand,
  desktopLinks,
  mobileLinks,
  themeToggle,
  cta,
}: {
  menuLabel: string;
  closeMenuLabel: string;
  brand: ReactNode;
  desktopLinks: ReactNode;
  mobileLinks: readonly { href: string; label: string }[];
  themeToggle: ReactNode;
  cta: ReactNode;
}) {
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
      aria-label={menuLabel}
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
            {brand}
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? closeMenuLabel : menuLabel}
              onClick={() => setMenuOpen((open) => !open)}
              className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden"
            >
              <Menu className="in-data-[state=active]:opacity-0 m-auto size-6 transition-opacity duration-200" />
              <X className="in-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 opacity-0 transition-opacity duration-200" />
            </button>
          </div>

          <div className="absolute inset-0 m-auto hidden size-fit lg:block">
            {desktopLinks}
          </div>

          <div className="in-data-[state=active]:block lg:in-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border bg-background p-6 shadow-2xl shadow-foreground/10 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none">
            <div className="w-full lg:hidden">
              <ul className="space-y-6 text-base">
                {mobileLinks.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className="block text-muted-foreground transition-colors duration-150 hover:text-foreground"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
              {themeToggle}
              {cta}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
