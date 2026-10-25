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

`site:quality` builds the production static export, validates its HTML and metadata, serves `apps/site/out` with Lighthouse CI's built-in static server, and runs five mobile Lighthouse executions. Lighthouse CI and Lighthouse are pinned by the lockfile. CI uses the Playwright Chromium pinned there too; for the same browser locally, set `CHROME_PATH=$(node -p "require('@playwright/test').chromium.executablePath()")`. Chrome runs headless with `--no-sandbox`, which the runner's AppArmor policy requires for a browser not installed as a system package.

Blocking, on the median run unless noted:

- Performance at least 90, Accessibility and Best Practices at least 95, SEO 100.
- Median LCP under 2.5 s and CLS under 0.1.
- At most 215,000 bytes of script (206,617 today) and no third-party request.

Warning only: median total blocking time under 200 ms.

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

Real throttling slows the CPU relative to the machine, and `ubuntu-latest`
machines differ: Lighthouse's benchmark index ranged from about 2,400 to 4,400
across CI runs of this site. On the slowest machines the same build measured a
median total blocking time from about 160 ms to 220 ms on different runs, on the
fastest about 20 ms; LCP stayed at 1.60–1.68 s everywhere. A 200 ms gate on that
number fails at random. Regressions are still caught:

- Performance blocks and gives total blocking time 30% of its score: one second
  of main-thread work on load drops it to 77.
- The script budget catches added JavaScript on any machine: 45 KB more script
  failed it on a runner where Performance still scored 100.

Never lower a threshold merely to make CI pass. Diagnose the regression first, without removing useful content or degrading the experience for a score.

## CI check

`.github/workflows/site-quality.yml` runs on every pull request and push to
`main`, in three jobs:

1. `Site changes` diffs the change against its base with `git diff` pathspecs:
   `apps/site`, the `libs/ui` folders the site renders (`components`, `icons`,
   `lib`, `styles`, plus `libs/ui/package.json`), the root manifests, lockfile,
   `.node-version`, `turbo.json`, the setup action and the workflow, excluding
   Markdown and tests. If git cannot compute the diff, it counts as a site
   change.
2. `Lighthouse` runs only for a site change.
3. `Site quality` always runs. It fails when `Site changes` failed, or when the
   site changed and `Lighthouse` did not succeed, including when it was
   cancelled. It passes when the site did not change.

To make the gate required, add the status check `Site quality` (source: GitHub
Actions) to the `main` ruleset next to `Static analysis`, `Tests and build` and
`Analyze`. Never require `Lighthouse`: it is skipped on changes that do not
touch the site.

## Troubleshooting

- Each run posts a notice with its benchmark index, Performance, total blocking
  time and LCP, and each failed or warned assertion posts an annotation with all
  five values. Compare benchmark indexes before calling a slower run a
  regression.
- The `lighthouse-results` artifact holds `apps/site/.lighthouseci`: every run's
  JSON and HTML report plus `assertion-results.json`, failed runs included.
- Raise the script budget only in the pull request that needs the bytes, and
  state why.

## Production monitoring

Lighthouse measures a controlled lab run. It does not replace field Core Web Vitals. Once `velachess.com` has enough traffic, monitor the 75th percentile for LCP <= 2.5s, CLS <= 0.1, and INP <= 200ms through [PageSpeed Insights](https://developers.google.com/speed/docs/insights/v5/get-started) and the [CrUX API](https://developer.chrome.com/docs/crux/api). Production monitoring remains non-blocking until that data is representative.

## Static export

The deployable artifact is `apps/site/out`. Request-time rendering, middleware, server actions, dynamic cookies, and Next.js runtime image optimization are unavailable; the site keeps content static and uses fixed image dimensions with pre-generated WebP assets.
