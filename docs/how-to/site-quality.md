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

`site:quality` builds the production static export, validates its HTML and metadata, serves `apps/site/out` with Lighthouse CI's built-in static server, and runs five mobile Lighthouse executions. CI uses the Playwright Chromium pinned in the lockfile; locally, set `CHROME_PATH=$(node -p "require('@playwright/test').chromium.executablePath()")` for the same browser. It runs with `--no-sandbox` because the runner's AppArmor policy blocks the sandbox for browsers not installed as system packages.

Blocking: Accessibility and Best Practices at least 95 and SEO 100 on the median run, median LCP under 2.5 s, CLS under 0.1, at most 215,000 bytes of script, and no third-party request.

Warning only: Performance at least 90 and median total blocking time under 200 ms.

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
under simulation. The trade is reproducibility: real throttling is more
exposed to runner CPU noise, which the five runs and the median absorb for LCP
but not for total blocking time.

## Why total blocking time only warns

Real throttling slows the CPU relative to the machine, so total blocking time
measures the runner as much as the page. Across six CI runs of one build,
runner speed (Lighthouse's benchmark index) ranged from about 2,400 to 4,100 and
median total blocking time from about 165 ms to 60 ms, while LCP stayed at
1.61–1.66 s. Performance follows total blocking time, which carries 30% of the
score. The script budget is the blocking guard for what raises both on this
page: more JavaScript to hydrate.

Never lower a threshold merely to make CI pass. Diagnose the regression first, without removing useful content or degrading the experience for a score.

## CI check

`.github/workflows/site-quality.yml` publishes `Site quality / Lighthouse`. A
`paths` filter runs it on pull requests and pushes to `main` that change
`apps/site`, the `libs/ui` folders the site renders (`components`, `icons`,
`lib`, `styles`), dependencies, toolchain files or the workflow. Tests and
Markdown do not trigger it. It must not be a required check: under a `paths`
filter it would stay pending on every pull request it skips.

Every run uploads `apps/site/.lighthouseci` (reports and
`assertion-results.json`) as `lighthouse-results`, failures included.

## Production monitoring

Lighthouse measures a controlled lab run. It does not replace field Core Web Vitals. Once `velachess.com` has enough traffic, monitor the 75th percentile for LCP <= 2.5s, CLS <= 0.1, and INP <= 200ms through [PageSpeed Insights](https://developers.google.com/speed/docs/insights/v5/get-started) and the [CrUX API](https://developer.chrome.com/docs/crux/api). Production monitoring remains non-blocking until that data is representative.

## Static export

The deployable artifact is `apps/site/out`. Request-time rendering, middleware, server actions, dynamic cookies, and Next.js runtime image optimization are unavailable; the site keeps content static and uses fixed image dimensions with pre-generated WebP assets.
