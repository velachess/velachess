---
name: site-quality
description: Guard VelaChess public-site SEO, performance, accessibility, and static-export quality when changing apps/site or its CI checks.
---

# Site Quality

Use the production static export as the authority. Build `apps/site/out`, run its SEO tests, then run Lighthouse CI. Keep pages semantic, keyboard-accessible, and understandable without JavaScript.

## Invariants

- Preserve one descriptive `h1` and an ordered heading hierarchy.
- Use Next.js metadata, robots, sitemap, image, and font APIs. Every meaningful image has useful alt text.
- Keep Server Components by default. Add a Client Component only for behavior that requires browser state or events, and keep that boundary at the leaf.
- Reserve image dimensions, optimize formats, preload only the actual LCP asset, and avoid font variants the page does not use.
- Static export cannot rely on request-time rendering, middleware, server actions, dynamic cookies, or runtime image optimization.
- Treat LCP <= 2.5s, CLS <= 0.1, and INP <= 200ms as field targets. Lighthouse is the lab guard; its total blocking time is only an interactivity proxy, not field INP.

## Blocking Gates

Run three Lighthouse executions and assert the representative median run:

- Performance >= 90
- Accessibility >= 95
- Best Practices >= 95
- SEO = 100

Never lower quality thresholds merely to make CI pass. Investigate the regression first.

Lighthouse is a regression guard, not the product goal. Do not degrade UX or remove meaningful content merely to improve scores.

Production field monitoring belongs in PageSpeed Insights and CrUX and remains non-blocking until VelaChess has enough real traffic for meaningful data.
