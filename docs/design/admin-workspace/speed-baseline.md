# Admin workspace speed baseline

Measured September 14, 2026 on commit
`0bce28cbc120657a501b35404221b947f9777f88` (branch
`claude/admin-perf-baseline`, two commits on `origin/main` `64c0ff4b`). This is
phase 1 of the approved speed overhaul. It measures today's Admin and changes no
user-facing behavior. The raw report is
[`speed-baseline.json`](speed-baseline.json): counts, durations, byte sizes,
generic labels and route shapes only.

## Environment

This is a local production build on `wrangler dev` with local fixtures. It is
not production.

| item                | value                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| machine             | Apple M3 Pro, 11 CPU cores, 18 GB memory, macOS 26.5 (25F71)                                                                                                                                                                                                                                                                                                                      |
| machine load        | 7-run pass 12:00:12Z to 12:34:06Z. Load averages at start 4.68 / 4.98 / 5.71, at end 5.49 / 5.31 / 5.17. The 1-minute average, sampled every 15 s, ranged 3.52 to 7.85 (mean 5.05, 134 samples) and never exceeded 8. macOS media analysis, storage management and knowledge services were active. Local workerd previews from other checkouts were running and were not touched. |
| build               | `pnpm preview:admin:owner`: `content:generate`, dependency builds, then `astro build` with `ADMIN_LOCAL_OWNER=1` into the ignored `apps/admin/.local/local-owner-dist`                                                                                                                                                                                                            |
| server              | wrangler 4.125.0 dev (workerd 1.20260820.1) on `127.0.0.1:8871`, state in the worktree's ignored `apps/admin/.wrangler/state`. One warm server process served both passes.                                                                                                                                                                                                        |
| browser             | Playwright 1.63.0, Chromium 153.0.8010.12 new headless, fresh context per run, device scale factor 1, no CPU or network throttling, service workers blocked, `ap-theme` cookie with a matching `colorScheme`                                                                                                                                                                      |
| viewports           | 390 x 844, 768 x 1024, 1280 x 900                                                                                                                                                                                                                                                                                                                                                 |
| toolchain           | Node 24.19.0, pnpm 10.5.2, Astro 5.18.2, React 19.2.8                                                                                                                                                                                                                                                                                                                             |
| D1                  | No application tables. A `wrangler d1 migrations apply DB --local` attempt against the worktree state stopped at `0001_service_registry.sql` (`no such table: status_checks`) because the chain assumes a baseline schema that is not in the repo. It left only the empty migration ledger. The eight `/life/health` statements therefore fail fast.                              |
| editorial           | No Worker secrets, so `/api/editorial/record` answers 503 and record editors show `editor_not_configured`. Durable Object read time is not represented.                                                                                                                                                                                                                           |
| Operations and Life | No transport configured. Their loaders return immediately.                                                                                                                                                                                                                                                                                                                        |

## Method

`scripts/admin/perf-measure.mjs` drives Chromium against the preview. It starts
nothing and refuses a non-loopback base. Every run opens a fresh context, so no
cache, cookie or storage carries between runs. An init script installs
PerformanceObservers (paint, largest contentful paint, layout shift, long task,
event timing with `durationThreshold` 16), one document MutationObserver,
loading-element tracking, capture-phase pointerdown and click stamps in
`sessionStorage`, and a no-op React DevTools hook that sees each root's
hydration commit. Node counts requests and main-frame navigations through
Playwright and reads CDP `Performance.getMetrics` before and after. Waits are
readiness checks, never fixed sleeps. A run is settled when any pending document
has committed, `readyState` is complete, every `client:load` island has committed
hydration, no request is in flight and the DOM has been quiet for 300 ms.

Cells:

| cell                 | what it does                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `load:content`       | `/content`                                                                                                                             |
| `load:writing`       | `/content?group=writing`                                                                                                               |
| `load:newsletter`    | `/newsletter`                                                                                                                          |
| `load:record`        | the first visible record link in the `/content` library, resolved at 1280 light (a writing record, reported as `/content/writing/:id`) |
| `load:operations`    | `/operations/observability?view=machines`                                                                                              |
| `load:life`          | `/life`                                                                                                                                |
| `load:life-health`   | `/life/health`, the only loader on these routes that uses D1                                                                           |
| `switch:content-nav` | start `/content`, then click Content navigation Writing, Pages, Projects, Newsletter (from the navigation drawer at 390 and 768)       |
| `switch:record`      | start `/content`, click the first visible library record, then its breadcrumb back to the library                                      |
| `switch:operations`  | start Operations machines, click the side navigation Loops link                                                                        |
| `switch:life`        | start `/life`, click People, then Timeline                                                                                             |

Every cell ran at three widths, in light and dark, 7 times each: 294 load runs
and 168 switch runs holding 378 switch steps. All 462 runs succeeded and the
report lists no problems. Summaries are the median (mean of the middle pair when
even) and nearest-rank p90. With 7 runs the p90 is the slowest run.

A first pass at 5 runs flagged 37 of 276 timing cells whose p90 sat more than
max(25 ms, 35% of the median) above the median, and the 1-minute load average
briefly passed 8 during it, so the baseline was rerun at 7 runs. Between the two
passes, per-cell medians moved by a median of 1 to 16 ms (1.4% to 8.2%) depending
on the metric, with the 90th percentile of those moves between 8 and 47 ms.
Medians are reproducible. Single slow runs are common: 56 of 276 timing cells in
the 7-run pass have a slowest run more than 35% above the median. The 5-run
report is not committed.

## Metric definitions

Times are milliseconds from navigation start for loads and from the click event
for switches. Tables show median / p90.

| metric                                         | definition                                                                                                                                                                                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TTFB                                           | navigation `responseStart`: response headers received. Astro streams the body afterwards. For a switch it is measured from the click, so it includes unloading the previous document.                                                                                         |
| FCP, LCP                                       | first contentful paint, and the last largest contentful paint candidate before settle                                                                                                                                                                                         |
| interactive                                    | every `client:load` island's React root has committed with hydration finished, read from the React DevTools hook (source `react-commit` in all 294 load runs)                                                                                                                 |
| settled                                        | the latest of last DOM mutation, last resource response end, interactive and load, before the 300 ms quiet window                                                                                                                                                             |
| CLS                                            | largest session window (1 s gap, 5 s cap) of layout shifts without recent input                                                                                                                                                                                               |
| long tasks, long task ms, blocking ms          | `longtask` entries, their total duration, and the time past 50 ms per task                                                                                                                                                                                                    |
| requests                                       | Playwright request events from navigation or input until settled, including the document                                                                                                                                                                                      |
| JS KB, CSS KB, HTML KB                         | Resource Timing `transferSize` (or `decodedBodySize` where labeled decoded) for `.js`/`.mjs`, `.css` and the document                                                                                                                                                         |
| document request                               | the switch issued a main-frame document request                                                                                                                                                                                                                               |
| first change                                   | click to the first frame showing a change in `#astryx-app-shell-main`. On a new document it is the later of that document's FCP and the region marker. In place it is the first region mutation after pointerdown, then `requestAnimationFrame` plus a `MessageChannel` task. |
| INP (max event)                                | the largest Event Timing entry with an `interactionId` from the input. Entries under 16 ms are not reported, and a document that unloads may not report, so "none reported" means either.                                                                                     |
| loading shown, loading visible, status regions | runs where `.astryx-skeleton`, `.admin-loading` or `[aria-busy="true"]` appeared after the input, how long any was present, and the most distinct `role="status"` ancestors announcing them at once                                                                           |
| server timing                                  | the `Server-Timing` header: `app` is middleware to Response object, `inventory`, `record`, `newsletter`, `operations` and `life` are loader durations, `d1` sums query durations, `d1q` counts queries                                                                        |
| CPU task, script, layout, style                | CDP `TaskDuration`, `ScriptDuration`, `LayoutDuration`, `RecalcStyleDuration`, after minus before                                                                                                                                                                             |
| heap MB                                        | CDP `JSHeapUsedSize` after settle, a point sample that depends on when garbage collection last ran                                                                                                                                                                            |

## Results

### Initial load

| route                                     | width | theme | ok  | TTFB     | FCP      | LCP      | interactive | settled   | CLS           | long tasks | requests | JS KB     |
| ----------------------------------------- | ----- | ----- | --- | -------- | -------- | -------- | ----------- | --------- | ------------- | ---------- | -------- | --------- |
| `/content`                                | 390   | light | 7/7 | 29 / 36  | 80 / 88  | 80 / 88  | 198 / 202   | 727 / 743 | 0.066 / 0.066 | 1 / 1      | 54 / 54  | 296 / 296 |
| `/content`                                | 390   | dark  | 7/7 | 31 / 33  | 76 / 96  | 76 / 96  | 218 / 257   | 748 / 791 | 0.066 / 0.066 | 1 / 1      | 54 / 54  | 296 / 296 |
| `/content`                                | 768   | light | 7/7 | 32 / 35  | 76 / 84  | 76 / 84  | 199 / 259   | 727 / 791 | 0.056 / 0.056 | 1 / 1      | 54 / 54  | 296 / 296 |
| `/content`                                | 768   | dark  | 7/7 | 31 / 39  | 76 / 88  | 76 / 88  | 206 / 213   | 736 / 744 | 0.056 / 0.056 | 1 / 1      | 54 / 54  | 296 / 296 |
| `/content`                                | 1280  | light | 7/7 | 29 / 143 | 80 / 188 | 80 / 188 | 196 / 300   | 738 / 838 | 0.000 / 0.000 | 1 / 1      | 54 / 54  | 296 / 296 |
| `/content`                                | 1280  | dark  | 7/7 | 29 / 35  | 80 / 84  | 80 / 84  | 200 / 223   | 737 / 762 | 0.000 / 0.000 | 1 / 1      | 54 / 54  | 296 / 296 |
| `/content?group=writing`                  | 390   | light | 7/7 | 17 / 20  | 64 / 76  | 64 / 76  | 172 / 192   | 516 / 539 | 0.067 / 0.067 | 0 / 0      | 54 / 54  | 296 / 296 |
| `/content?group=writing`                  | 390   | dark  | 7/7 | 17 / 25  | 68 / 76  | 68 / 76  | 172 / 209   | 519 / 558 | 0.067 / 0.067 | 0 / 0      | 54 / 54  | 296 / 296 |
| `/content?group=writing`                  | 768   | light | 7/7 | 15 / 23  | 64 / 68  | 64 / 68  | 161 / 199   | 508 / 547 | 0.056 / 0.056 | 0 / 0      | 54 / 54  | 296 / 296 |
| `/content?group=writing`                  | 768   | dark  | 7/7 | 16 / 23  | 68 / 76  | 68 / 76  | 178 / 189   | 524 / 535 | 0.056 / 0.056 | 0 / 0      | 54 / 54  | 296 / 296 |
| `/content?group=writing`                  | 1280  | light | 7/7 | 19 / 21  | 68 / 80  | 68 / 80  | 181 / 184   | 527 / 530 | 0.000 / 0.000 | 0 / 0      | 54 / 54  | 296 / 296 |
| `/content?group=writing`                  | 1280  | dark  | 7/7 | 16 / 34  | 68 / 88  | 68 / 88  | 181 / 279   | 527 / 625 | 0.000 / 0.000 | 0 / 0      | 54 / 54  | 296 / 296 |
| `/newsletter`                             | 390   | light | 7/7 | 18 / 27  | 68 / 76  | 68 / 76  | 170 / 207   | 505 / 541 | 0.067 / 0.067 | 0 / 0      | 54 / 54  | 296 / 296 |
| `/newsletter`                             | 390   | dark  | 7/7 | 16 / 25  | 64 / 72  | 64 / 72  | 166 / 181   | 502 / 515 | 0.067 / 0.067 | 0 / 0      | 54 / 54  | 296 / 296 |
| `/newsletter`                             | 768   | light | 7/7 | 17 / 34  | 72 / 80  | 72 / 80  | 178 / 266   | 513 / 598 | 0.056 / 0.056 | 0 / 0      | 54 / 54  | 296 / 296 |
| `/newsletter`                             | 768   | dark  | 7/7 | 18 / 27  | 72 / 72  | 72 / 72  | 184 / 235   | 519 / 572 | 0.056 / 0.056 | 0 / 0      | 54 / 54  | 296 / 296 |
| `/newsletter`                             | 1280  | light | 7/7 | 16 / 28  | 68 / 76  | 68 / 76  | 174 / 195   | 509 / 531 | 0.000 / 0.000 | 0 / 0      | 54 / 54  | 296 / 296 |
| `/newsletter`                             | 1280  | dark  | 7/7 | 16 / 23  | 64 / 76  | 64 / 76  | 185 / 202   | 520 / 537 | 0.000 / 0.000 | 0 / 0      | 54 / 54  | 296 / 296 |
| `/content/writing/:id`                    | 390   | light | 7/7 | 21 / 35  | 72 / 88  | 72 / 88  | 202 / 321   | 306 / 395 | 0.066 / 0.066 | 0 / 0      | 61 / 61  | 713 / 713 |
| `/content/writing/:id`                    | 390   | dark  | 7/7 | 22 / 37  | 88 / 88  | 88 / 88  | 193 / 255   | 307 / 344 | 0.066 / 0.066 | 0 / 0      | 61 / 61  | 713 / 713 |
| `/content/writing/:id`                    | 768   | light | 7/7 | 29 / 45  | 80 / 88  | 80 / 88  | 211 / 354   | 307 / 416 | 0.056 / 0.056 | 0 / 0      | 61 / 61  | 713 / 713 |
| `/content/writing/:id`                    | 768   | dark  | 7/7 | 26 / 46  | 84 / 104 | 84 / 104 | 209 / 221   | 306 / 307 | 0.056 / 0.056 | 0 / 0      | 61 / 61  | 713 / 713 |
| `/content/writing/:id`                    | 1280  | light | 7/7 | 22 / 42  | 80 / 100 | 80 / 100 | 205 / 218   | 305 / 307 | 0.000 / 0.000 | 0 / 0      | 61 / 61  | 713 / 713 |
| `/content/writing/:id`                    | 1280  | dark  | 7/7 | 25 / 34  | 84 / 92  | 84 / 92  | 209 / 236   | 305 / 307 | 0.000 / 0.000 | 0 / 0      | 61 / 61  | 713 / 713 |
| `/operations/observability?view=machines` | 390   | light | 7/7 | 11 / 12  | 60 / 76  | 60 / 76  | 144 / 344   | 148 / 350 | 0.067 / 0.067 | 0 / 0      | 52 / 52  | 229 / 229 |
| `/operations/observability?view=machines` | 390   | dark  | 7/7 | 10 / 13  | 64 / 76  | 64 / 76  | 149 / 236   | 153 / 238 | 0.067 / 0.067 | 0 / 0      | 52 / 52  | 229 / 229 |
| `/operations/observability?view=machines` | 768   | light | 7/7 | 10 / 15  | 64 / 72  | 64 / 72  | 145 / 168   | 148 / 174 | 0.056 / 0.056 | 0 / 0      | 52 / 52  | 229 / 229 |
| `/operations/observability?view=machines` | 768   | dark  | 7/7 | 11 / 11  | 64 / 76  | 64 / 76  | 150 / 166   | 152 / 176 | 0.056 / 0.056 | 0 / 0      | 52 / 52  | 229 / 229 |
| `/operations/observability?view=machines` | 1280  | light | 7/7 | 9 / 13   | 60 / 76  | 60 / 76  | 152 / 268   | 153 / 269 | 0.000 / 0.000 | 0 / 0      | 52 / 52  | 229 / 229 |
| `/operations/observability?view=machines` | 1280  | dark  | 7/7 | 9 / 17   | 60 / 76  | 60 / 76  | 142 / 318   | 143 / 319 | 0.000 / 0.000 | 0 / 0      | 52 / 52  | 229 / 229 |
| `/life`                                   | 390   | light | 7/7 | 10 / 25  | 68 / 72  | 68 / 72  | 147 / 152   | 149 / 154 | 0.066 / 0.066 | 0 / 0      | 53 / 53  | 235 / 235 |
| `/life`                                   | 390   | dark  | 7/7 | 9 / 16   | 64 / 164 | 64 / 164 | 147 / 232   | 148 / 233 | 0.066 / 0.066 | 0 / 0      | 53 / 53  | 235 / 235 |
| `/life`                                   | 768   | light | 7/7 | 11 / 14  | 64 / 72  | 64 / 72  | 149 / 163   | 150 / 163 | 0.056 / 0.056 | 0 / 0      | 53 / 53  | 235 / 235 |
| `/life`                                   | 768   | dark  | 7/7 | 11 / 13  | 68 / 72  | 68 / 72  | 146 / 156   | 147 / 162 | 0.056 / 0.056 | 0 / 0      | 53 / 53  | 235 / 235 |
| `/life`                                   | 1280  | light | 7/7 | 10 / 13  | 68 / 72  | 68 / 72  | 150 / 171   | 150 / 171 | 0.000 / 0.000 | 0 / 0      | 53 / 53  | 235 / 235 |
| `/life`                                   | 1280  | dark  | 7/7 | 9 / 12   | 64 / 64  | 64 / 64  | 148 / 203   | 148 / 203 | 0.000 / 0.000 | 0 / 0      | 53 / 53  | 235 / 235 |
| `/life/health`                            | 390   | light | 7/7 | 15 / 32  | 72 / 76  | 72 / 76  | 146 / 159   | 149 / 161 | 0.066 / 0.066 | 0 / 0      | 46 / 46  | 204 / 204 |
| `/life/health`                            | 390   | dark  | 7/7 | 11 / 18  | 64 / 76  | 64 / 76  | 136 / 148   | 145 / 151 | 0.066 / 0.066 | 0 / 0      | 46 / 46  | 204 / 204 |
| `/life/health`                            | 768   | light | 7/7 | 11 / 23  | 64 / 72  | 64 / 72  | 151 / 162   | 160 / 176 | 0.056 / 0.056 | 0 / 0      | 46 / 46  | 204 / 204 |
| `/life/health`                            | 768   | dark  | 7/7 | 12 / 22  | 60 / 76  | 60 / 76  | 151 / 170   | 161 / 176 | 0.056 / 0.056 | 0 / 0      | 46 / 46  | 204 / 204 |
| `/life/health`                            | 1280  | light | 7/7 | 12 / 13  | 60 / 72  | 60 / 72  | 150 / 163   | 150 / 163 | 0.000 / 0.000 | 0 / 0      | 46 / 46  | 204 / 204 |
| `/life/health`                            | 1280  | dark  | 7/7 | 12 / 20  | 72 / 80  | 72 / 80  | 147 / 183   | 147 / 183 | 0.000 / 0.000 | 0 / 0      | 46 / 46  | 204 / 204 |

LCP equals FCP in all 294 load runs. `/content` is the only route with a long task on
load (one task of 220 to 240 ms) and the most CPU (338 to 398 ms). The Content
library routes (`/content`, Writing, Newsletter) settle at 500 to 750 ms, 330 to
530 ms after interactive, while Operations and Life settle within 10 ms of
interactive. That tail is not attributed in this pass. No resource came
from the HTTP cache in any run.

### Switches

| workspace  | step              | width | theme | ok  | document request | first change | settled   | INP (max event)            | CLS           | requests | loading shown | loading visible | status regions |
| ---------- | ----------------- | ----- | ----- | --- | ---------------- | ------------ | --------- | -------------------------- | ------------- | -------- | ------------- | --------------- | -------------- |
| Content    | Writing           | 390   | light | 7/7 | yes 7/7          | 98 / 113     | 543 / 579 | 24 / 24                    | 0.067 / 0.067 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Pages             | 390   | light | 7/7 | yes 7/7          | 85 / 102     | 530 / 552 | 16 / 24 (5 of 7 reported)  | 0.066 / 0.066 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Projects          | 390   | light | 7/7 | yes 7/7          | 97 / 130     | 603 / 674 | 16 / 32 (6 of 7 reported)  | 0.067 / 0.067 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Newsletter        | 390   | light | 7/7 | yes 7/7          | 83 / 111     | 510 / 560 | 16 / 24 (5 of 7 reported)  | 0.067 / 0.067 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Writing           | 390   | dark  | 7/7 | yes 7/7          | 98 / 115     | 529 / 569 | 24 / 24 (5 of 7 reported)  | 0.067 / 0.067 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Pages             | 390   | dark  | 7/7 | yes 7/7          | 96 / 102     | 534 / 565 | 24 / 24                    | 0.066 / 0.066 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Projects          | 390   | dark  | 7/7 | yes 7/7          | 98 / 115     | 580 / 594 | 24 / 24 (6 of 7 reported)  | 0.067 / 0.067 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Newsletter        | 390   | dark  | 7/7 | yes 7/7          | 84 / 135     | 511 / 565 | 24 / 24 (6 of 7 reported)  | 0.067 / 0.067 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Writing           | 768   | light | 7/7 | yes 7/7          | 97 / 151     | 543 / 630 | 24 / 24 (6 of 7 reported)  | 0.056 / 0.056 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Pages             | 768   | light | 7/7 | yes 7/7          | 87 / 136     | 531 / 603 | 16 / 24 (6 of 7 reported)  | 0.056 / 0.056 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Projects          | 768   | light | 7/7 | yes 7/7          | 103 / 160    | 583 / 708 | 24 / 24 (5 of 7 reported)  | 0.056 / 0.056 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Newsletter        | 768   | light | 7/7 | yes 7/7          | 84 / 133     | 522 / 653 | 16 / 24 (5 of 7 reported)  | 0.056 / 0.056 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Writing           | 768   | dark  | 7/7 | yes 7/7          | 98 / 233     | 567 / 772 | 24 / 24 (6 of 7 reported)  | 0.056 / 0.056 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Pages             | 768   | dark  | 7/7 | yes 7/7          | 84 / 97      | 537 / 572 | 16 / 24 (3 of 7 reported)  | 0.056 / 0.056 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Projects          | 768   | dark  | 7/7 | yes 7/7          | 97 / 448     | 597 / 921 | 16 / 24 (6 of 7 reported)  | 0.056 / 0.056 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Newsletter        | 768   | dark  | 7/7 | yes 7/7          | 86 / 131     | 530 / 657 | 20 / 24 (4 of 7 reported)  | 0.056 / 0.056 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Writing           | 1280  | light | 7/7 | yes 7/7          | 71 / 99      | 500 / 591 | 16 / 16 (1 of 7 reported)  | 0.000 / 0.000 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Pages             | 1280  | light | 7/7 | yes 7/7          | 90 / 138     | 528 / 557 | 20 / 24 (4 of 7 reported)  | 0.000 / 0.000 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Projects          | 1280  | light | 7/7 | yes 7/7          | 86 / 98      | 584 / 745 | 16 / 16 (5 of 7 reported)  | 0.000 / 0.000 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Newsletter        | 1280  | light | 7/7 | yes 7/7          | 70 / 102     | 506 / 546 | 16 / 16 (1 of 7 reported)  | 0.000 / 0.000 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Writing           | 1280  | dark  | 7/7 | yes 7/7          | 75 / 102     | 495 / 502 | 16 / 16 (1 of 7 reported)  | 0.000 / 0.000 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Pages             | 1280  | dark  | 7/7 | yes 7/7          | 70 / 90      | 548 / 637 | 16 / 16 (1 of 7 reported)  | 0.000 / 0.000 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Projects          | 1280  | dark  | 7/7 | yes 7/7          | 82 / 102     | 579 / 615 | 16 / 16 (4 of 7 reported)  | 0.000 / 0.000 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Newsletter        | 1280  | dark  | 7/7 | yes 7/7          | 86 / 102     | 513 / 533 | 16 / 16 (2 of 7 reported)  | 0.000 / 0.000 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Library to record | 390   | light | 7/7 | yes 7/7          | 82 / 93      | 312 / 315 | none reported              | 0.066 / 0.066 | 61 / 61  | 7/7           | 258 / 266       | 2 / 2          |
| Content    | Record to library | 390   | light | 7/7 | yes 7/7          | 167 / 218    | 657 / 701 | 96 / 96 (5 of 7 reported)  | 0.067 / 0.067 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Library to record | 390   | dark  | 7/7 | yes 7/7          | 71 / 84      | 311 / 317 | 16 / 16 (1 of 7 reported)  | 0.066 / 0.066 | 61 / 61  | 7/7           | 264 / 273       | 2 / 2          |
| Content    | Record to library | 390   | dark  | 7/7 | yes 7/7          | 167 / 234    | 644 / 746 | 96 / 104 (5 of 7 reported) | 0.067 / 0.067 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Library to record | 768   | light | 7/7 | yes 7/7          | 69 / 87      | 311 / 316 | none reported              | 0.056 / 0.056 | 61 / 61  | 7/7           | 269 / 275       | 2 / 2          |
| Content    | Record to library | 768   | light | 7/7 | yes 7/7          | 170 / 299    | 610 / 780 | 84 / 96 (4 of 7 reported)  | 0.056 / 0.056 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Library to record | 768   | dark  | 7/7 | yes 7/7          | 79 / 85      | 311 / 318 | 20 / 24 (2 of 7 reported)  | 0.056 / 0.056 | 61 / 61  | 7/7           | 264 / 271       | 2 / 2          |
| Content    | Record to library | 768   | dark  | 7/7 | yes 7/7          | 150 / 231    | 636 / 698 | 76 / 80 (4 of 7 reported)  | 0.056 / 0.056 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Library to record | 1280  | light | 7/7 | yes 7/7          | 71 / 87      | 311 / 311 | none reported              | 0.000 / 0.000 | 61 / 61  | 7/7           | 263 / 274       | 2 / 2          |
| Content    | Record to library | 1280  | light | 7/7 | yes 7/7          | 214 / 234    | 696 / 731 | 96 / 128 (6 of 7 reported) | 0.000 / 0.000 | 54 / 54  | 0/7           | 0               | 0              |
| Content    | Library to record | 1280  | dark  | 7/7 | yes 7/7          | 72 / 89      | 311 / 312 | none reported              | 0.000 / 0.000 | 61 / 61  | 7/7           | 264 / 275       | 2 / 2          |
| Content    | Record to library | 1280  | dark  | 7/7 | yes 7/7          | 206 / 235    | 680 / 732 | 88 / 128 (5 of 7 reported) | 0.000 / 0.000 | 54 / 54  | 0/7           | 0               | 0              |
| Operations | Loops             | 390   | light | 7/7 | yes 7/7          | 83 / 96      | 178 / 412 | 16 / 24 (4 of 7 reported)  | 0.067 / 0.067 | 52 / 52  | 0/7           | 0               | 0              |
| Operations | Loops             | 390   | dark  | 7/7 | yes 7/7          | 83 / 85      | 171 / 305 | 24 / 24 (2 of 7 reported)  | 0.067 / 0.067 | 52 / 52  | 0/7           | 0               | 0              |
| Operations | Loops             | 768   | light | 7/7 | yes 7/7          | 86 / 118     | 195 / 434 | 24 / 24 (4 of 7 reported)  | 0.056 / 0.056 | 52 / 52  | 0/7           | 0               | 0              |
| Operations | Loops             | 768   | dark  | 7/7 | yes 7/7          | 83 / 97      | 185 / 271 | 24 / 24 (3 of 7 reported)  | 0.056 / 0.056 | 52 / 52  | 0/7           | 0               | 0              |
| Operations | Loops             | 1280  | light | 7/7 | yes 7/7          | 71 / 87      | 150 / 160 | none reported              | 0.000 / 0.000 | 52 / 52  | 0/7           | 0               | 0              |
| Operations | Loops             | 1280  | dark  | 7/7 | yes 7/7          | 71 / 71      | 155 / 232 | none reported              | 0.000 / 0.000 | 52 / 52  | 0/7           | 0               | 0              |
| Life       | People            | 390   | light | 7/7 | yes 7/7          | 85 / 97      | 161 / 199 | 24 / 24 (3 of 7 reported)  | 0.066 / 0.066 | 53 / 53  | 0/7           | 0               | 0              |
| Life       | Timeline          | 390   | light | 7/7 | yes 7/7          | 80 / 167     | 159 / 283 | 16 / 16 (1 of 7 reported)  | 0.066 / 0.066 | 53 / 53  | 0/7           | 0               | 0              |
| Life       | People            | 390   | dark  | 7/7 | yes 7/7          | 79 / 84      | 152 / 201 | 24 / 24 (2 of 7 reported)  | 0.066 / 0.066 | 53 / 53  | 0/7           | 0               | 0              |
| Life       | Timeline          | 390   | dark  | 7/7 | yes 7/7          | 83 / 100     | 171 / 210 | 16 / 16 (2 of 7 reported)  | 0.066 / 0.066 | 53 / 53  | 0/7           | 0               | 0              |
| Life       | People            | 768   | light | 7/7 | yes 7/7          | 85 / 115     | 185 / 281 | 24 / 24 (3 of 7 reported)  | 0.056 / 0.056 | 53 / 53  | 0/7           | 0               | 0              |
| Life       | Timeline          | 768   | light | 7/7 | yes 7/7          | 83 / 167     | 168 / 238 | 20 / 24 (2 of 7 reported)  | 0.056 / 0.056 | 53 / 53  | 0/7           | 0               | 0              |
| Life       | People            | 768   | dark  | 7/7 | yes 7/7          | 81 / 117     | 159 / 219 | 20 / 24 (2 of 7 reported)  | 0.056 / 0.056 | 53 / 53  | 0/7           | 0               | 0              |
| Life       | Timeline          | 768   | dark  | 7/7 | yes 7/7          | 83 / 165     | 164 / 235 | 24 / 24 (1 of 7 reported)  | 0.056 / 0.056 | 53 / 53  | 0/7           | 0               | 0              |
| Life       | People            | 1280  | light | 7/7 | yes 7/7          | 67 / 87      | 157 / 206 | none reported              | 0.000 / 0.000 | 53 / 53  | 0/7           | 0               | 0              |
| Life       | Timeline          | 1280  | light | 7/7 | yes 7/7          | 70 / 86      | 161 / 175 | none reported              | 0.000 / 0.000 | 53 / 53  | 0/7           | 0               | 0              |
| Life       | People            | 1280  | dark  | 7/7 | yes 7/7          | 86 / 150     | 163 / 236 | 16 / 16 (2 of 7 reported)  | 0.000 / 0.000 | 53 / 53  | 0/7           | 0               | 0              |
| Life       | Timeline          | 1280  | dark  | 7/7 | yes 7/7          | 70 / 86      | 156 / 184 | none reported              | 0.000 / 0.000 | 53 / 53  | 0/7           | 0               | 0              |

Every step of every switch is a full document navigation. Leaving a record is
the slowest step: its TTFB from the click is 111 / 166 ms while the server's
`app` time is 17 ms, and the click's event presentation is 86 ms at the median,
so the old record page delays the next frame by about 86 ms before the library
document arrives. The record page is the only switch that shows a loading state.

### Server timing

| route                                     | runs | TTFB    | app    | loader     | loader dur | inventory | d1      | d1 queries |
| ----------------------------------------- | ---- | ------- | ------ | ---------- | ---------- | --------- | ------- | ---------- |
| `/content`                                | 42   | 31 / 37 | 3 / 4  | inventory  | 2 / 3      | same      | n/a     | n/a        |
| `/content?group=writing`                  | 42   | 16 / 23 | 2 / 3  | inventory  | 2 / 2      | same      | n/a     | n/a        |
| `/newsletter`                             | 42   | 16 / 25 | 4 / 5  | newsletter | 1 / 2      | 2 / 2     | n/a     | n/a        |
| `/content/writing/:id`                    | 42   | 24 / 37 | 8 / 14 | record     | 4 / 10     | 2 / 6     | n/a     | n/a        |
| `/operations/observability?view=machines` | 42   | 10 / 12 | 1 / 1  | operations | 0 / 0      | n/a       | n/a     | n/a        |
| `/life`                                   | 42   | 10 / 13 | 1 / 1  | life       | 0 / 0      | n/a       | n/a     | n/a        |
| `/life/health`                            | 42   | 12 / 20 | 5 / 7  | life       | 4 / 6      | n/a       | 31 / 45 | 8 / 8      |

| observed in                     | API path                | status | calls | browser duration | app   | record |
| ------------------------------- | ----------------------- | ------ | ----- | ---------------- | ----- | ------ |
| load:record                     | `/api/editorial/record` | 503    | 42    | 3 / 4            | 0 / 0 | n/a    |
| switch:record Library to record | `/api/editorial/record` | 503    | 42    | 4 / 5            | 0 / 1 | n/a    |

Worker clocks advance only across I/O, so these durations are I/O waits and pure
CPU work reads as 0. Compare `app` with TTFB for the unmeasured CPU and transport
share. `d1` adds up concurrent statements, so it can exceed `life`.

### CPU, heap and bundle

| route                                     | width | runs | CPU task  | script    | layout  | style  | long task ms | blocking ms | heap MB     | JS KB decoded | CSS KB decoded | HTML KB decoded | script requests |
| ----------------------------------------- | ----- | ---- | --------- | --------- | ------- | ------ | ------------ | ----------- | ----------- | ------------- | -------------- | --------------- | --------------- |
| `/content`                                | 390   | 14   | 342 / 353 | 273 / 282 | 13 / 14 | 9 / 10 | 222 / 230    | 172 / 180   | 25.5 / 25.6 | 888 / 888     | 195 / 195      | 257 / 257       | 48 / 48         |
| `/content`                                | 768   | 14   | 338 / 390 | 270 / 275 | 13 / 14 | 9 / 10 | 220 / 225    | 170 / 175   | 25.5 / 25.6 | 888 / 888     | 195 / 195      | 257 / 257       | 48 / 48         |
| `/content`                                | 1280  | 14   | 398 / 422 | 281 / 286 | 11 / 12 | 9 / 10 | 235 / 240    | 185 / 190   | 8.8 / 8.8   | 888 / 888     | 195 / 195      | 257 / 257       | 48 / 48         |
| `/content?group=writing`                  | 390   | 14   | 135 / 140 | 82 / 85   | 10 / 11 | 6 / 7  | 0 / 0        | 0 / 0       | 9.6 / 9.6   | 888 / 888     | 195 / 195      | 138 / 138       | 48 / 48         |
| `/content?group=writing`                  | 768   | 14   | 136 / 138 | 83 / 84   | 10 / 10 | 6 / 7  | 0 / 0        | 0 / 0       | 9.6 / 9.7   | 888 / 888     | 195 / 195      | 138 / 138       | 48 / 48         |
| `/content?group=writing`                  | 1280  | 14   | 137 / 142 | 83 / 85   | 10 / 10 | 7 / 7  | 0 / 0        | 0 / 0       | 9.0 / 9.0   | 888 / 888     | 195 / 195      | 138 / 138       | 48 / 48         |
| `/newsletter`                             | 390   | 14   | 121 / 128 | 70 / 71   | 10 / 11 | 6 / 6  | 0 / 0        | 0 / 0       | 8.0 / 8.1   | 888 / 888     | 195 / 195      | 85 / 85         | 48 / 48         |
| `/newsletter`                             | 768   | 14   | 120 / 127 | 68 / 72   | 10 / 10 | 6 / 6  | 0 / 0        | 0 / 0       | 8.1 / 8.1   | 888 / 888     | 195 / 195      | 85 / 85         | 48 / 48         |
| `/newsletter`                             | 1280  | 14   | 122 / 124 | 70 / 72   | 9 / 10  | 6 / 6  | 0 / 0        | 0 / 0       | 8.1 / 8.1   | 888 / 888     | 195 / 195      | 85 / 85         | 48 / 48         |
| `/content/writing/:id`                    | 390   | 14   | 108 / 117 | 52 / 54   | 10 / 12 | 5 / 5  | 0 / 0        | 0 / 0       | 8.1 / 8.3   | 2144 / 2144   | 195 / 195      | 58 / 58         | 54 / 54         |
| `/content/writing/:id`                    | 768   | 14   | 107 / 110 | 52 / 53   | 10 / 11 | 4 / 5  | 0 / 0        | 0 / 0       | 8.1 / 8.1   | 2144 / 2144   | 195 / 195      | 58 / 58         | 54 / 54         |
| `/content/writing/:id`                    | 1280  | 14   | 108 / 118 | 51 / 54   | 9 / 13  | 5 / 6  | 0 / 0        | 0 / 0       | 8.4 / 8.4   | 2144 / 2144   | 195 / 195      | 58 / 58         | 54 / 54         |
| `/operations/observability?view=machines` | 390   | 14   | 80 / 85   | 35 / 37   | 9 / 10  | 6 / 6  | 0 / 0        | 0 / 0       | 5.6 / 5.6   | 688 / 688     | 381 / 381      | 55 / 55         | 45 / 45         |
| `/operations/observability?view=machines` | 768   | 14   | 82 / 84   | 35 / 36   | 9 / 10  | 6 / 6  | 0 / 0        | 0 / 0       | 5.6 / 5.6   | 688 / 688     | 381 / 381      | 55 / 55         | 45 / 45         |
| `/operations/observability?view=machines` | 1280  | 14   | 79 / 82   | 33 / 35   | 9 / 9   | 7 / 7  | 0 / 0        | 0 / 0       | 5.4 / 5.4   | 688 / 688     | 381 / 381      | 55 / 55         | 45 / 45         |
| `/life`                                   | 390   | 14   | 78 / 82   | 33 / 36   | 8 / 9   | 5 / 6  | 0 / 0        | 0 / 0       | 5.5 / 5.5   | 705 / 705     | 381 / 381      | 62 / 62         | 46 / 46         |
| `/life`                                   | 768   | 14   | 80 / 83   | 34 / 36   | 9 / 10  | 6 / 6  | 0 / 0        | 0 / 0       | 5.5 / 5.6   | 705 / 705     | 381 / 381      | 62 / 62         | 46 / 46         |
| `/life`                                   | 1280  | 14   | 79 / 82   | 33 / 34   | 9 / 10  | 7 / 7  | 0 / 0        | 0 / 0       | 5.3 / 5.3   | 705 / 705     | 381 / 381      | 62 / 62         | 46 / 46         |
| `/life/health`                            | 390   | 14   | 71 / 76   | 31 / 33   | 8 / 9   | 4 / 5  | 0 / 0        | 0 / 0       | 5.1 / 5.1   | 628 / 628     | 381 / 381      | 45 / 45         | 39 / 39         |
| `/life/health`                            | 768   | 14   | 71 / 77   | 32 / 33   | 8 / 9   | 4 / 4  | 0 / 0        | 0 / 0       | 5.1 / 5.1   | 628 / 628     | 381 / 381      | 45 / 45         | 39 / 39         |
| `/life/health`                            | 1280  | 14   | 72 / 75   | 30 / 31   | 8 / 9   | 5 / 6  | 0 / 0        | 0 / 0       | 4.9 / 4.9   | 628 / 628     | 381 / 381      | 45 / 45         | 39 / 39         |

| workspace  | step              | width | runs | CPU task, new process runs | script        | long task ms | long tasks | heap MB after | JS KB transferred |
| ---------- | ----------------- | ----- | ---- | -------------------------- | ------------- | ------------ | ---------- | ------------- | ----------------- |
| Content    | Writing           | 390   | 14   | 104 / 107 (14 of 14)       | 47 / 49       | 0 / 0        | 0 / 0      | 15.3 / 15.4   | 296 / 296         |
| Content    | Writing           | 768   | 14   | 101 / 110 (14 of 14)       | 45 / 51       | 0 / 0        | 0 / 0      | 15.3 / 15.4   | 296 / 296         |
| Content    | Writing           | 1280  | 14   | 95 / 106 (14 of 14)        | 47 / 51       | 0 / 0        | 0 / 0      | 15.7 / 15.7   | 296 / 296         |
| Content    | Pages             | 390   | 14   | 120 / 127 (12 of 14)       | 47 / 49       | 0 / 0        | 0 / 0      | 9.0 / 9.0     | 296 / 296         |
| Content    | Pages             | 768   | 14   | 122 / 129 (11 of 14)       | 46 / 49       | 0 / 0        | 0 / 0      | 9.0 / 9.0     | 296 / 296         |
| Content    | Pages             | 1280  | 14   | 103 / 116 (8 of 14)        | 44 / 46       | 0 / 0        | 0 / 0      | 9.0 / 23.6    | 296 / 296         |
| Content    | Projects          | 390   | 14   | 143 / 153 (7 of 14)        | 92 / 94       | 75 / 76      | 1 / 1      | 17.8 / 17.9   | 296 / 296         |
| Content    | Projects          | 768   | 14   | 156 / 158 (5 of 14)        | 94 / 101      | 79 / 84      | 1 / 1      | 17.9 / 17.9   | 296 / 296         |
| Content    | Projects          | 1280  | 14   | not separable              | not separable | 83 / 87      | 1 / 1      | 21.2 / 21.3   | 296 / 296         |
| Content    | Newsletter        | 390   | 14   | 89 / 122 (14 of 14)        | 36 / 40       | 0 / 0        | 0 / 0      | 23.8 / 31.0   | 296 / 296         |
| Content    | Newsletter        | 768   | 14   | 96 / 128 (14 of 14)        | 37 / 44       | 0 / 0        | 0 / 0      | 14.9 / 31.1   | 296 / 296         |
| Content    | Newsletter        | 1280  | 14   | 82 / 89 (14 of 14)         | 35 / 37       | 0 / 0        | 0 / 0      | 35.0 / 35.0   | 296 / 296         |
| Content    | Library to record | 390   | 14   | 79 / 82 (14 of 14)         | 26 / 27       | 0 / 0        | 0 / 0      | 17.7 / 17.7   | 713 / 713         |
| Content    | Library to record | 768   | 14   | 73 / 84 (14 of 14)         | 26 / 28       | 0 / 0        | 0 / 0      | 17.7 / 18.2   | 713 / 713         |
| Content    | Library to record | 1280  | 14   | 79 / 174 (14 of 14)        | 26 / 27       | 0 / 0        | 0 / 0      | 18.6 / 18.6   | 713 / 713         |
| Content    | Record to library | 390   | 14   | 123 / 123 (1 of 14)        | 56 / 56       | 0 / 0        | 0 / 0      | 10.2 / 10.2   | 296 / 296         |
| Content    | Record to library | 768   | 14   | not separable              | not separable | 0 / 0        | 0 / 0      | 10.2 / 10.2   | 296 / 296         |
| Content    | Record to library | 1280  | 14   | 122 / 123 (2 of 14)        | 53 / 54       | 0 / 0        | 0 / 0      | 10.3 / 10.4   | 296 / 296         |
| Operations | Loops             | 390   | 14   | 64 / 68 (14 of 14)         | 15 / 16       | 0 / 0        | 0 / 0      | 9.3 / 9.3     | 229 / 229         |
| Operations | Loops             | 768   | 14   | 64 / 67 (14 of 14)         | 14 / 15       | 0 / 0        | 0 / 0      | 9.3 / 9.4     | 229 / 229         |
| Operations | Loops             | 1280  | 14   | 61 / 69 (14 of 14)         | 13 / 15       | 0 / 0        | 0 / 0      | 8.8 / 8.9     | 229 / 229         |
| Life       | People            | 390   | 14   | 59 / 62 (14 of 14)         | 13 / 14       | 0 / 0        | 0 / 0      | 9.2 / 9.2     | 235 / 235         |
| Life       | People            | 768   | 14   | 59 / 64 (14 of 14)         | 13 / 14       | 0 / 0        | 0 / 0      | 9.2 / 9.3     | 235 / 235         |
| Life       | People            | 1280  | 14   | 55 / 61 (14 of 14)         | 11 / 12       | 0 / 0        | 0 / 0      | 8.3 / 8.3     | 235 / 235         |
| Life       | Timeline          | 390   | 14   | 56 / 61 (14 of 14)         | 12 / 13       | 0 / 0        | 0 / 0      | 13.2 / 13.2   | 235 / 235         |
| Life       | Timeline          | 768   | 14   | 58 / 60 (14 of 14)         | 12 / 13       | 0 / 0        | 0 / 0      | 13.2 / 13.2   | 235 / 235         |
| Life       | Timeline          | 1280  | 14   | 53 / 56 (14 of 14)         | 10 / 11       | 0 / 0        | 0 / 0      | 10.9 / 10.9   | 235 / 235         |

The first table covers a single document in a fresh context. For switches, the
page's CDP task counters restart across document navigations, and the
harness detects a restart only when the new total is lower than the old one. The
switch table therefore reports CPU from runs with a detected restart, where the
value covers the destination document, and marks steps without one as not
separable. A probe saw the counter total drop after a navigation click. Long task and heap columns do
not depend on the delta.

## What this means for the definition of done

| definition of done                            | today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | gap                                                                                                                                                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No document request on an in-workspace switch | Fails everywhere. 378 of 378 switch steps issued a document request and loaded a new document: all four Content navigation steps, both record round-trip steps, Operations Loops, and Life People and Timeline. Each step made 52 to 61 requests, including 45 to 54 scripts.                                                                                                                                                                                                                                                                    | Every step, 100% of runs                                                                                                                                                                                                                                    |
| Paint within 100 ms                           | Pooled first change is 84 / 150 ms, and 92 of 378 step runs took longer than 100 ms. Record to library fails at every width, 150 to 214 ms median and up to 299 ms p90, with 41 of 42 runs over. Content navigation is 84 to 97 ms median per step, 102 to 117 ms pooled p90 and up to 448 ms in its slowest cell, with 43 of 168 runs over. Operations Loops has 1 of 42 runs over and Life 7 of 84. These are loopback results: outside Record to library, switch TTFB from the click is 23 to 41 ms and the server's `app` time is 1 to 5 ms. | Record to library by 50 to 114 ms at the median, and the pooled p90 of every Content navigation step by 2 to 17 ms. Production adds network round trips, Access and the edge to every document switch, so the local medians under 100 ms do not carry over. |
| Prefetch on hover, focus or pointerdown       | Absent. `apps/admin` has no Astro prefetch, ClientRouter or speculation rules. The harness's hover, pointerdown and click added no requests beyond the destination document's own.                                                                                                                                                                                                                                                                                                                                                               | Not implemented                                                                                                                                                                                                                                             |
| No layout shift                               | Fails at 390 and 768 on every load and every switch step: CLS 0.0664 to 0.0666 at 390 and 0.0557 to 0.0558 at 768, 0 at 1280. A layout-shift source probe attributes it to `#astryx-app-shell-main` moving down 56 to 57 px when a bar is inserted above it after first paint. On `/content`, sub-0.001 shifts from Astryx button and icon stacks also occur at every width.                                                                                                                                                                     | 0.056 to 0.067 per document at narrow widths                                                                                                                                                                                                                |
| One skeleton approach                         | Loading state appears only on the record route, in 42 of 42 loads and 42 of 42 Library to record steps: up to 14 skeleton elements under 2 concurrent `role="status"` regions from `AdminFeedback`, visible for about 260 ms. That breaks the one-announcement-per-wait constraint. The other switches show no loading state because each is a server-rendered document. In source, `AdminFeedback` owns the shared skeleton while `SavedArticlePreview` and `LifeWorkspace` each carry their own busy state.                                    | Two announcements where one is allowed, and more than one loading implementation                                                                                                                                                                            |

The skeleton-to-content swap on the record page adds no measured shift at 1280,
but the editor itself never loads locally because the editorial API answers 503.

## Limitations

- Loopback, not production: no network round trip, Cloudflare Access, edge,
  cold start or production asset caching. `wrangler dev` answers
  `If-None-Match` with a full 200, so every document refetches its scripts and
  `cachedResources` is 0 everywhere.
- Fixtures: the editorial Durable Object read, D1 queries against real tables,
  and Operations and Life transports are not represented. The record cells use
  the first visible writing record only.
- Server-Timing durations are Worker I/O waits. Pure CPU reads as 0.
- CPU deltas for document switches are only partly separable, as described
  above. A harness follow-up should read metrics from a fresh CDP session per
  document or compare process identity.
- Heap is a point sample: `/content` reads 25.5 MB at 390 and 768 but 8.8 MB at
  1280, most likely garbage collection timing rather than width.
- First change for today's document switches is the destination FCP. After the
  overhaul, in-place switches use the region marker. Both mark the first frame
  that shows a change, but they are different signals.
- The machine was not fully idle. Headless desktop-class Chromium without CPU
  throttling is faster than a phone; `--cpu-throttle` exists for that.

## Rerun

```bash
cd <worktree> && export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
pnpm preview:admin:owner          # terminal 1, serves 127.0.0.1:8871
uptime                            # wait while the 1-minute load is above 8
node scripts/admin/perf-measure.mjs .local/perf/baseline.json --runs 7
```

Stop the preview with Ctrl+C afterwards. `--cells`, `--widths`, `--themes`,
`--cpu-throttle` and `--list` narrow or vary a rerun. Compare medians first; a
p90 from 7 runs is a single run.
