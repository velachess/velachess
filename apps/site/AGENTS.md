# Agent Guide — `apps/site`

Extends `../../AGENTS.md`. Read that first; this file only states what is
different or additional for the public site.

## Purpose

Next.js App Router static export for `velachess.com`. The authenticated
product remains in `apps/web`. Read `docs/explanation/apps/site.md` before
changing its structure or rendering model.

## Boundaries

- The deployable artifact is `out/`. Do not add request-time rendering,
  middleware, server actions, dynamic cookies, runtime image optimization,
  backend imports, or application state.
- Keep Server Components by default and put a client boundary at the leaf
  that needs browser state or events.
- Reuse tokens and primitives from `@velachess/ui`; do not create a second
  theme or install registry components here.
- User-facing copy uses Lingui. Run
  `pnpm --filter @velachess/site i18n:extract` after changing it.
- Product screenshots come from the deterministic capture flow in
  `e2e/capture/` at the repository root; do not replace them with hand-made fixture
  state in this app.

## Verification

Read `docs/how-to/site-quality.md` for SEO, accessibility, performance,
metadata, deterministic screenshots, static-export verification, and the
associated CI gate.
