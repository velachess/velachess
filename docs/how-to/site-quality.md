# Verify the public site

The public site has two quality loops:

```text
PR -> Lighthouse CI -> blocking
Production -> CrUX/PageSpeed -> monitoring -> non-blocking
```

## Local gate

Generate the product screenshots before the first build, then run the complete gate:

```bash
pnpm site:capture
pnpm site:quality
```

`site:quality` builds the production static export, validates its HTML and metadata, serves `apps/site/out` with Lighthouse CI's built-in static server, and runs three mobile Lighthouse executions.

The representative median run must score at least 90 Performance, 95 Accessibility, 95 Best Practices, and exactly 100 SEO. LCP is capped at 2.5 seconds, CLS at 0.1, and total blocking time at 200 ms. Total blocking time is a lab proxy, not an INP measurement.

Never lower a threshold merely to make CI pass. Diagnose the regression first, without removing useful content or degrading the experience for a score.

## CI check

`.github/workflows/site-quality.yml` publishes the `Site quality / Lighthouse` check. Configure that exact check as required in the `main` branch protection rule. The workflow is deliberately separate from deployment.

## Production monitoring

Lighthouse measures a controlled lab run. It does not replace field Core Web Vitals. Once `velachess.com` has enough traffic, monitor the 75th percentile for LCP <= 2.5s, CLS <= 0.1, and INP <= 200ms through [PageSpeed Insights](https://developers.google.com/speed/docs/insights/v5/get-started) and the [CrUX API](https://developer.chrome.com/docs/crux/api). Production monitoring remains non-blocking until that data is representative.

## Static export

The deployable artifact is `apps/site/out`. Request-time rendering, middleware, server actions, dynamic cookies, and Next.js runtime image optimization are unavailable; the site keeps content static and uses fixed image dimensions with pre-generated WebP assets.
