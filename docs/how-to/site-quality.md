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

`site:quality` builds the production static export, validates its HTML and metadata, serves `apps/site/out` with Lighthouse CI's built-in static server, and runs five mobile Lighthouse executions. CI measures with the repository's pinned Playwright Chromium, so a browser change arrives in the pull request that bumps Playwright rather than with a runner image update; to use the same browser locally, prefix the command with `CHROME_PATH=$(node -p "require('@playwright/test').chromium.executablePath()")`. Chrome runs with `--no-sandbox`: the runner's AppArmor policy blocks the user namespaces Chromium's sandbox needs for a browser not installed as a system package, and the page under audit is our own static export.

Blocking: the representative median run scores at least 95 Accessibility, 95 Best Practices and exactly 100 SEO; median LCP stays under 2.5 seconds and CLS under 0.1; the page ships at most 215,000 bytes of script and makes no third-party request.

Reported, not blocking: Performance at least 90 and median total blocking time under 200 ms. Both still appear in every run's output and report. Total blocking time is a lab proxy, not an INP measurement.

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
exposed to runner CPU noise than a model is. For LCP the five runs, the median
aggregation and the remaining margin absorb it; for total blocking time they do
not.

## Why total blocking time warns instead of failing

Real throttling slows the CPU by a factor of the machine it runs on, so total
blocking time measures the runner as much as the page. GitHub's `ubuntu-latest`
hands out machines of different speed: across six CI runs of one build,
Lighthouse's benchmark index ranged from about 2,400 to 4,100, and the median
total blocking time from about 165 ms on the slowest to about 60 ms on the
fastest. Locally, ten runs gave a median of 294 ms idle and 692 ms with one core
busy. Performance moves with it, since total blocking time carries 30% of the
score. LCP barely moved anywhere: 1.61–1.66 s across every CI run. A blocking gate on these two numbers fails on a busy runner and
passes on a quiet one. The blocking script budget catches the main thing that
raises them on a static page: more JavaScript to download and hydrate.

Never lower a threshold merely to make CI pass. Diagnose the regression first, without removing useful content or degrading the experience for a score.

## CI check

`.github/workflows/site-quality.yml` publishes the `Site quality / Lighthouse`
check. It runs on pull requests and pushes to `main` that touch what the site
renders or how it is measured, through GitHub's own `paths` filter: `apps/site`,
the parts of `libs/ui` the site renders (`components`, `icons`, `lib`, `styles`
and its `package.json`), the dependency and toolchain files, and the workflow
itself. Tests and Markdown never trigger it. The server, worker, web app, other
libraries and the rest of `libs/ui` (`chess`, `charts`, `layout`) skip it.

Because of the filter the check is not required on `main`: a required check
under a `paths` filter stays pending on every pull request that skips it. Do
not make it required without removing the filter.

Every run uploads `apps/site/.lighthouseci` — each run's JSON and HTML report
and `assertion-results.json` — as the `lighthouse-results` artifact, failed runs
included.

## Production monitoring

Lighthouse measures a controlled lab run. It does not replace field Core Web Vitals. Once `velachess.com` has enough traffic, monitor the 75th percentile for LCP <= 2.5s, CLS <= 0.1, and INP <= 200ms through [PageSpeed Insights](https://developers.google.com/speed/docs/insights/v5/get-started) and the [CrUX API](https://developer.chrome.com/docs/crux/api). Production monitoring remains non-blocking until that data is representative.

## Static export

The deployable artifact is `apps/site/out`. Request-time rendering, middleware, server actions, dynamic cookies, and Next.js runtime image optimization are unavailable; the site keeps content static and uses fixed image dimensions with pre-generated WebP assets.
