import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const out = path.resolve(import.meta.dirname, "../out");
const html = readFileSync(path.join(out, "index.html"), "utf8");
const page = new DOMParser().parseFromString(html, "text/html");

function contentOf(selector: string): string | null {
  return page.querySelector(selector)?.getAttribute("content") ?? null;
}

describe("site output", () => {
  it("publishes the title, description, canonical URL, and language", () => {
    expect(page.title).toBe("VelaChess - Turn your games into training");
    expect(contentOf('meta[name="description"]')).toContain(
      "Import your Chess.com and Lichess games",
    );
    expect(page.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://velachess.com/",
    );
    expect(page.documentElement.getAttribute("lang")).toBe("en");
  });

  it("publishes complete Open Graph and Twitter metadata", () => {
    expect(contentOf('meta[property="og:title"]')).toBe(page.title);
    expect(contentOf('meta[property="og:description"]')).toBe(
      contentOf('meta[name="description"]'),
    );
    expect(contentOf('meta[property="og:url"]')).toBe("https://velachess.com/");
    expect(contentOf('meta[property="og:image"]')).toBe(
      "https://velachess.com/og-image.svg",
    );
    expect(contentOf('meta[name="twitter:card"]')).toBe("summary_large_image");
    expect(contentOf('meta[name="twitter:title"]')).toBe(page.title);
    expect(contentOf('meta[name="twitter:description"]')).toBe(
      contentOf('meta[name="description"]'),
    );
    expect(contentOf('meta[name="twitter:image"]')).toBe(
      "https://velachess.com/og-image.svg",
    );
  });

  it("keeps a single ordered heading hierarchy", () => {
    const headings = [...page.querySelectorAll("h1, h2, h3")];
    const levels = headings.map((heading) => Number(heading.tagName.slice(1)));

    expect(headings.filter((heading) => heading.tagName === "H1")).toHaveLength(1);
    expect(headings[0]?.textContent).toContain("Turn your games into training.");
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index]! - levels[index - 1]!).toBeLessThanOrEqual(1);
    }
  });

  it("gives every product image an alternative and preserves primary links", () => {
    const images = [...page.querySelectorAll("img")];
    expect(images.length).toBeGreaterThan(0);
    expect(images.every((image) => Boolean(image.getAttribute("alt")?.trim()))).toBe(
      true,
    );

    const links = [...page.querySelectorAll("a")];
    const productCtas = links.filter((link) =>
      link.textContent?.includes("Try VelaChess"),
    );
    expect(productCtas.length).toBeGreaterThan(0);
    expect(productCtas.every((link) => link.href === "https://app.velachess.com/")).toBe(
      true,
    );
    expect(
      links.some((link) => link.href === "https://github.com/velachess/velachess"),
    ).toBe(true);
  });

  it("makes the hero product image immediately discoverable", () => {
    const heroImage = page.querySelector("#top img");
    const heroPreload = page.querySelector(
      'link[rel="preload"][as="image"][imagesizes="100vw"]',
    );

    expect(heroImage?.getAttribute("loading")).not.toBe("lazy");
    expect(heroImage?.getAttribute("fetchpriority")).toBe("high");
    expect(heroImage?.getAttribute("width")).toBe("1440");
    expect(heroImage?.getAttribute("height")).toBe("900");
    expect(heroImage?.getAttribute("srcset")).toContain("game-analysis-640.webp");
    expect(heroImage?.getAttribute("srcset")).toContain("game-analysis-768.webp");
    expect(heroPreload?.getAttribute("fetchpriority")).toBe("high");
  });

  it("exports indexable robots and sitemap files", () => {
    const robots = readFileSync(path.join(out, "robots.txt"), "utf8");
    const sitemap = readFileSync(path.join(out, "sitemap.xml"), "utf8");

    expect(robots).toContain("User-Agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Sitemap: https://velachess.com/sitemap.xml");
    expect(sitemap).toContain("<loc>https://velachess.com</loc>");
  });
});
