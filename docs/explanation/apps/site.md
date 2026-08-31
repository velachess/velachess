# apps/site — the public site

`apps/site` is the independently deployable public presence for
`velachess.com`. The authenticated product remains in `apps/web` at
`app.velachess.com`.

```
src/
  app/       Next.js routes, metadata and composition
  landing/   the marketing vertical (also owns image-loader.ts — Next's
             custom image-loader contract, but the data it serves is this
             vertical's own two product images, so it lives here, not in
             a shared bucket or libs/)
  locales/   Lingui source catalog and i18n.ts (the Lingui instance every
             vertical activates from — a site-wide concern, not landing's)
public/
  product/   generated screenshots, never fixture state
```

No `shared/`: same rule as `apps/web` (see `docs/explanation/apps/web.md`)
— a file's owner is what it does, not that it's used from more than one
place.

The site is a Next.js 16 App Router static export. Components are Server
Components unless browser behavior earns a client boundary. It has no
queries, server actions, providers, application state, database access,
or imports from backend/domain slices.

`libs/ui` supplies tokens, shadcn primitives, the VelaChess mark and
Lucide icons. Nothing was extracted from `apps/web`: the reusable parts
already had the correct owner, while TanStack navigation and product
screens remain framework-specific.

The screenshots are produced from deterministic fixtures inside the real
`apps/web` game-analysis and drill slices. `e2e/capture/` at the repository root
uses Playwright's own `webServer`, routing, viewport and screenshot APIs;
`pnpm site:capture` writes only the final WebP files into
`apps/site/public/product`.

The deployable artifact is `apps/site/out`. See
[`site-quality.md`](../../how-to/site-quality.md) for the blocking SEO and
Lighthouse gates.
