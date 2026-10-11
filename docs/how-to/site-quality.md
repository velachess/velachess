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

`site:quality` builds the production static export, validates its HTML and metadata, serves `apps/site/out` with Lighthouse CI's built-in static server, and runs five mobile Lighthouse executions.

The representative median run must score at least 90 Performance, 95 Accessibility, 95 Best Practices, and exactly 100 SEO. LCP is capped at 2.5 seconds, CLS at 0.1, and total blocking time at 200 ms. Total blocking time is a lab proxy, not an INP measurement.

## Why the run uses real throttling

`lighthouserc.json` sets `throttlingMethod: "devtools"`, so Chrome applies the
mobile CPU and network throttling for real and Lighthouse reports the paint it
observed.

Lighthouse's default, `simulate`, runs the page unthrottled and then estimates
the metrics from a model of the request graph. For this page that estimate is
not a paint time: it collapses onto Time to Interactive — `largestContentfulPaint`
and `interactive` come back as the same number — because the model charges LCP
for downloading and executing every deferred script the App Router ships,
whether or not the hero has already painted. On a static export whose hero
paints in well under 100 ms, the estimate landed at about 2.6 s against a 2.5 s
budget and failed pull requests for a paint that had already happened.

Largest Contentful Paint is a Core Web Vitals paint metric, and the budget is
there to gate the paint. Real throttling measures it: the same build reports
about 1.6 s with a 50 ms spread across runs, against 2.6 s with a 200 ms spread
under simulation. The trade is reproducibility — real throttling is more
exposed to runner CPU noise than a model is — which the five runs, the median
aggregation and the remaining margin absorb.

Never lower a threshold merely to make CI pass. Diagnose the regression first, without removing useful content or degrading the experience for a score.

## CI check

`.github/workflows/site-quality.yml` publishes the `Site quality / Lighthouse` check. Configure that exact check as required in the `main` branch protection rule. The workflow is deliberately separate from deployment.

A pull request runs the gate only when `apps/site` or `libs/ui` changed; a push
to `main` always runs it, so drift that arrives through a dependency still
fails somewhere. The workflow itself stays unfiltered: a `paths:` filter under
`on:` would leave the required check permanently pending on every other pull
request, whereas steps skipped inside a job that did run report green.

## Production monitoring

Lighthouse measures a controlled lab run. It does not replace field Core Web Vitals. Once `velachess.com` has enough traffic, monitor the 75th percentile for LCP <= 2.5s, CLS <= 0.1, and INP <= 200ms through [PageSpeed Insights](https://developers.google.com/speed/docs/insights/v5/get-started) and the [CrUX API](https://developer.chrome.com/docs/crux/api). Production monitoring remains non-blocking until that data is representative.

## Static export

The deployable artifact is `apps/site/out`. Request-time rendering, middleware, server actions, dynamic cookies, and Next.js runtime image optimization are unavailable; the site keeps content static and uses fixed image dimensions with pre-generated WebP assets.
