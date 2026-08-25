import { msg } from "@lingui/core/macro";
import { buttonVariants } from "@velachess/ui/components/button";
import { ThemeToggle } from "@velachess/ui/components/theme-toggle";
import { VelaChessMark } from "@velachess/ui/icons";

import { i18n } from "../shared/i18n.ts";
import { LandingHeaderNav } from "./landing-header-nav.tsx";

const PRODUCT_URL = "https://app.velachess.com";

const COPY = {
  brand: msg`VelaChess`,
  product: msg`Product`,
  howItWorks: msg`How it works`,
  getStarted: msg`Get Started`,
  menu: msg`Open navigation`,
  closeMenu: msg`Close navigation`,
  themeToggle: msg`Toggle theme`,
  themeSystem: msg`System`,
  themeLight: msg`Light`,
  themeDark: msg`Dark`,
} as const;

const NAVIGATION = [
  { href: "#product", label: COPY.product },
  { href: "#how-it-works", label: COPY.howItWorks },
] as const;

export function LandingHeader() {
  return (
    <LandingHeaderNav
      menuLabel={i18n._(COPY.menu)}
      closeMenuLabel={i18n._(COPY.closeMenu)}
      brand={<Brand />}
      desktopLinks={
        <ul className="flex gap-8 text-sm">
          {NAVIGATION.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="block text-base text-muted-foreground transition-colors duration-150 hover:text-foreground"
              >
                {i18n._(item.label)}
              </a>
            </li>
          ))}
        </ul>
      }
      mobileLinks={NAVIGATION.map((item) => ({
        href: item.href,
        label: i18n._(item.label),
      }))}
      themeToggle={
        <ThemeToggle
          labels={{
            toggle: i18n._(COPY.themeToggle),
            system: i18n._(COPY.themeSystem),
            light: i18n._(COPY.themeLight),
            dark: i18n._(COPY.themeDark),
          }}
        />
      }
      cta={
        <a
          href={PRODUCT_URL}
          className={buttonVariants({
            className: "h-8 rounded-full px-3 text-sm lg:inline-flex",
            size: "sm",
          })}
        >
          {i18n._(COPY.getStarted)}
        </a>
      }
    />
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
