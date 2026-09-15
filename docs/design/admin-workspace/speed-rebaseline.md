# Admin workspace speed re-baseline

Slice S1 of the [speed design](speed-design.md) (section 9, round A). It
extends `scripts/admin/perf-measure.mjs`, adds `scripts/admin/perf-proxy.mjs`,
and publishes the `--browser-defaults` table that S2 to S19 cite instead of
the original [`speed-baseline.md`](speed-baseline.md). The raw report is
[`speed-rebaseline.json`](speed-rebaseline.json): counts, durations, byte
sizes, browser feature flags and generic route labels only.

Measured September 15, 2026 against `origin/main` `4d8d05a9b` with the harness
at `29e0eb5ef`. It changes no user-facing behavior.

## Read this first: power state

Every pass in `speed-rebaseline.json` ran on battery with macOS low power mode
on. The Mac was unplugged at 02:23:56Z, after the first calibration run and
before any re-baseline pass. Under that state the same old harness on the same
build measured `interactive` 1.6x and FCP 1.3x the committed baseline, while
request counts, documents, CLS and announcement counts did not move.

What that means for later slices:

| use                                                           | safe from this table                                                                                                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| request, document, proxy, announcement and live-region counts | yes, they are power independent (reproduced exactly, below)                                                                                                                         |
| CLS and layout shift total                                    | yes, identical to the committed baseline where the build did not change                                                                                                             |
| Playwright defaults versus `--browser-defaults`               | yes, both modes ran interleaved in one process under the same conditions                                                                                                            |
| absolute milliseconds                                         | no. Read them as an upper bound. A slice that compares timings measures `origin/main` and its head in the same session with `--interleave`, and cites this table for structure only |

A plugged-in rerun of the commands in [Rerun](#rerun) replaces the timing
columns without changing the method. Until then, no slice may claim a timing
improvement against these absolute values.

## Environment

| item                    | value                                                                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| machine                 | Apple M3 Pro, 11 CPU cores, 18 GB memory, macOS 26.5 (25F71)                                                                                                                                                                                                        |
| power                   | AC for the calibration run (02:06Z to 02:23Z). Battery with low power mode for the A/B (04:09Z to 04:28Z) and every re-baseline pass (04:30Z to 05:30Z)                                                                                                             |
| machine load (1-minute) | calibration 4.55 to 12.75, mean 7.06, 65 samples. A/B 3.09 to 10.17, mean 5.81, 78 samples. Re-baseline 3.10 to 16.39, mean 6.32, 130 samples; content-nav pass 3.62 to 7.48, mean 5.20, 44 samples. Sampled every 15 s. Other agents and a video call were active  |
| builds                  | `pnpm build:admin:owner` at `0bce28cbc` (the committed baseline's app) for calibration and the A/B, and at `4d8d05a9b` (`origin/main`) for the re-baseline, each into an ignored directory                                                                          |
| server                  | wrangler 4.125.0 dev (workerd), loopback, a port other than 8871, 1355 or 4311, local fixtures                                                                                                                                                                      |
| browser                 | Playwright 1.63.0, Chromium 153.0.8010.12 new headless, fresh context per run                                                                                                                                                                                       |
| modes                   | `playwright`: Playwright's default switches, including `--disable-back-forward-cache` and `PaintHolding` in `--disable-features`. `browser-defaults`: the same switches with those two removed, verified from `chrome://version` at launch and recorded in the JSON |
| toolchain               | Node 24.19.0, pnpm 10.5.2                                                                                                                                                                                                                                           |

## What changed in the harness

| item                     | design reference     | how                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| counting proxy           | section 6            | `perf-proxy.mjs` is a loopback forward proxy that Chromium uses for every target. It counts each request by path class (`document`, `asset`, `record-read`, `api`, `other`) and `Sec-Purpose` (prefetch, prerender), tracks aborts before the first response byte, and refuses every other origin and CONNECT. With `--proxy` each step cross-checks the proxy against page requests: an upstream request without `Sec-Purpose` that no page request explains fails the run, and so does a document count that differs from `documentRequest`. Document counting itself is unchanged (`request.isNavigationRequest()` on the main frame) |
| `--browser-defaults`     | R19                  | removes `--disable-back-forward-cache` and `PaintHolding` from Playwright's launch, keeps every other default, and refuses to run if `chrome://version` still shows either. `--browser-modes playwright,browser-defaults` runs both in one interleaved report                                                                                                                                                                                                                                                                                                                                                                            |
| 1024 width               | S5, section 8        | `--widths` defaults to 390, 768, 1024, 1280; 1024 is 1024 x 900                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| touch at 390             | R1                   | `--inputs touch` emulates `hasTouch` and `isMobile` below 768 and presses through CDP touch events                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| dwell                    | understand section 1 | `--dwells 0,4,15,60` waits that long before each switch step and reports `dwellRequests` and `openBodiesAtPress`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| warm-up and interleaving | S1                   | `--warmup n` discards the first runs of every group; `--interleave` runs round-robin, rotating the start group each round                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| real press gap           | S17                  | `--press-gap` defaults to 80 ms between pointerdown and pointerup (`pointerdownToClickMs` reports what the page saw). `--press-gap 0` reproduces the committed baseline's press                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| announcements            | 4.5                  | `announcements.total` counts a non-empty text set on a live region after DOMContentLoaded, evaluated once per frame, so a clear plus re-set counts once and a region inserted with text counts once. `announcements.astryx` is the Astryx `useAnnounce` subset, `announcements.alert` the assertive subset. `loading.maxAnnouncements`, the committed "status regions" column, stays on the same runs. `liveRegions` counts Astryx polite and assertive regions and `role=status` elements at settle                                                                                                                                     |
| `layoutShiftTotal`       | section 8            | now in every markdown table next to CLS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| idle cells               | section 6            | `idle:content` (120 s) and `idle:operations` (125 s), visible, no input                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| intent cells             | section 6            | `intent:hover`, `intent:press-cancel`, `intent:touch-scroll`, `intent:drag-select`, `intent:right-click`, counting record reads started, cancelled within 1,500 ms, aborted before a response, completed and still active after the window                                                                                                                                                                                                                                                                                                                                                                                               |
| warm-cache cell          | S7                   | `warm:content`: a second document in the same context, counting `/_astro` resources and those served from cache                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| back cell                | S18                  | `back:content`: history back to `/content`, reporting `restoredFromBfcache` and Chromium's not-restored reasons                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| the 15 s record wait     | understand section 1 | a non-2xx response to a non-navigation request leaves the in-flight set at its headers. `/api/editorial/record` answers 503 locally and the page never reads the body, so Chromium held it until the 15 s abort and every step after it waited. The step now settles in about 300 ms; `--dwells 15` reproduces the old wait                                                                                                                                                                                                                                                                                                              |
| Content nav labels       | n/a                  | on `main` the group links read "Writing 6 records", so the label matcher accepts an optional trailing count                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Opt-in cells (idle, intent, warm, back) run only when named in `--cells`, so a
bare run still measures the committed cell list.

Tests: `node --test scripts/admin/perf-measure.test.mjs scripts/admin/perf-proxy.test.mjs`
(17 tests). On the old harness the new exports do not exist, and a
behavioural copy of the old `trackRequests` keeps the 503 request in flight
(`actual: 1, expected: 0`) and lacks the 1024 width.

## Reproducing the committed baseline

The acceptance is to reproduce the committed medians within the drift the
baseline recorded (per-cell median moves of 1 to 16 ms, 90th percentile 8 to
47 ms) and its exact request counts under Playwright defaults. Power made a
direct new-harness rerun on AC impossible, so the proof has two legs on the
committed baseline's own build (`0bce28cbc`).

**Leg 1, the machine on AC.** The unchanged harness, light theme, 7 runs, 390,
768 and 1280, against the committed medians:

| metric       | cells | median abs move   | p90 abs move | largest move                   |
| ------------ | ----- | ----------------- | ------------ | ------------------------------ |
| TTFB         | 48    | 2.1 ms            | 9.2 ms       | 112 ms, Record to library 1280 |
| FCP          | 21    | 4 ms              | 12 ms        | 12 ms                          |
| interactive  | 21    | 4.5 ms            | 13.9 ms      | 24.3 ms                        |
| settled      | 48    | 9.1 ms            | 32.2 ms      | 125 ms, Record to library 1280 |
| first change | 27    | 3.8 ms            | 61.2 ms      | 111 ms, Record to library 1280 |
| CLS          | 48    | 0                 | 0            | 0                              |
| requests     | 48    | exact in 48 of 48 |              |                                |

Everything sits inside the recorded drift except Record to library, whose first
change read 101 to 106 ms against the committed 167 to 214 ms. That step
depends on the idle dwell the unread 503 body forced (understand section 1),
and its penalty is not stable between sessions.

**Leg 2, old harness against new harness under identical conditions.** Same
build, battery, alternating which harness ran first per cell, 5 runs each,
light theme, 390 and 1280, new harness with `--press-gap 0` and, for
`switch:record`, `--dwells 15`:

| metric       | cells | median abs move old to new                       | p90 abs move | old / committed | new / committed |
| ------------ | ----- | ------------------------------------------------ | ------------ | --------------- | --------------- |
| TTFB         | 32    | 4.1 ms                                           | 20.3 ms      | 1.44            | 1.37            |
| FCP          | 14    | 8 ms                                             | 20 ms        | 1.26            | 1.36            |
| interactive  | 14    | 20.2 ms                                          | 63.8 ms      | 1.62            | 1.61            |
| settled      | 32    | 31.2 ms                                          | 84.8 ms      | 1.32            | 1.32            |
| first change | 18    | 12.2 ms                                          | 153 ms       | 1.27            | 1.23            |
| CLS          | 32    | 0                                                | 0            | 1.00            | 1.00            |
| requests     | 32    | exact in 32 of 32 (54, 61, 52, 53, 46 per route) |              |                 |                 |

The two harnesses read the same ratio to the committed baseline on every
timing metric, and every request count matches the committed value exactly.
The p90 first-change move is Library to record with `--dwells 15`: the new
harness also dwells before the first step, which the old one never did, and
that step then paid the idle-dwell document penalty (100 to 270 ms at 1280).

**Verdict.** Request counts: met, exact. Timing medians within the recorded
drift: met on AC by the unchanged harness, and the new harness is equivalent to
it under shared conditions; a new-harness run on AC against the committed
medians is still owed and belongs in the plugged-in rerun.

## Re-baseline (the table later slices cite)

`origin/main` `4d8d05a9b`, light theme, 5 measured runs after 1 discarded
warm-up per group, interleaved across both browser modes, counting proxy on,
80 ms press gap, mouse. Median / p90; with 5 runs the p90 is the slowest run.
Rows marked `browser-defaults` are the cited ones; `playwright` rows are the
same cells in the same session.

Build changes since the committed baseline move some counts: every Content,
Operations and Life document now makes 2 fewer requests (54 to 52, 61 to 59,
52 to 50) except `/life` (53 to 54) and `/life/health` (46 to 47).

### Initial load

| route                                     | width | mode             | ok  | TTFB     | FCP       | interactive | settled     | CLS             | layout shift total | long task ms | requests | JS KB | status regions (old) | announcements (new) |
| ----------------------------------------- | ----- | ---------------- | --- | -------- | --------- | ----------- | ----------- | --------------- | ------------------ | ------------ | -------- | ----- | -------------------- | ------------------- |
| `/content`                                | 390   | browser-defaults | 5/5 | 57 / 73  | 120 / 152 | 313 / 415   | 965 / 1067  | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 343 / 353    | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/content`                                | 390   | playwright       | 5/5 | 81 / 130 | 144 / 220 | 314 / 522   | 969 / 1201  | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 345 / 372    | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/content`                                | 768   | browser-defaults | 5/5 | 53 / 107 | 120 / 192 | 307 / 430   | 955 / 1086  | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 336 / 348    | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/content`                                | 768   | playwright       | 5/5 | 54 / 66  | 124 / 144 | 305 / 327   | 961 / 992   | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 356 / 361    | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/content`                                | 1024  | browser-defaults | 5/5 | 54 / 63  | 136 / 200 | 328 / 446   | 1043 / 1178 | 0.1374 / 0.1374 | 0.1374 / 0.1374    | 369 / 403    | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/content`                                | 1024  | playwright       | 5/5 | 45 / 53  | 124 / 136 | 304 / 421   | 980 / 1096  | 0.1374 / 0.1374 | 0.1374 / 0.1374    | 360 / 363    | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/content`                                | 1280  | browser-defaults | 5/5 | 52 / 277 | 112 / 352 | 293 / 549   | 965 / 1212  | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 358 / 375    | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/content`                                | 1280  | playwright       | 5/5 | 52 / 62  | 120 / 144 | 316 / 370   | 983 / 1054  | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 352 / 378    | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/content?group=writing`                  | 390   | browser-defaults | 5/5 | 48 / 56  | 120 / 144 | 315 / 457   | 680 / 831   | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 63 / 68      | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/content?group=writing`                  | 390   | playwright       | 5/5 | 27 / 43  | 96 / 120  | 270 / 298   | 639 / 665   | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 61 / 65      | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/content?group=writing`                  | 768   | browser-defaults | 5/5 | 29 / 37  | 96 / 116  | 270 / 309   | 634 / 678   | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 58 / 63      | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/content?group=writing`                  | 768   | playwright       | 5/5 | 26 / 50  | 104 / 152 | 266 / 588   | 633 / 962   | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 61 / 70      | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/content?group=writing`                  | 1024  | browser-defaults | 5/5 | 25 / 40  | 96 / 112  | 251 / 323   | 620 / 698   | 0.1299 / 0.1317 | 0.1299 / 0.1317    | 65 / 69      | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/content?group=writing`                  | 1024  | playwright       | 5/5 | 30 / 66  | 96 / 172  | 264 / 490   | 639 / 873   | 0.1333 / 0.1334 | 0.1333 / 0.1334    | 67 / 79      | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/content?group=writing`                  | 1280  | browser-defaults | 5/5 | 24 / 37  | 92 / 108  | 288 / 330   | 659 / 702   | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 68 / 70      | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/content?group=writing`                  | 1280  | playwright       | 5/5 | 26 / 50  | 88 / 128  | 270 / 389   | 643 / 757   | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 64 / 69      | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/newsletter`                             | 390   | browser-defaults | 5/5 | 36 / 164 | 116 / 232 | 345 / 502   | 691 / 852   | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 0 / 0        | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/newsletter`                             | 390   | playwright       | 5/5 | 29 / 56  | 104 / 152 | 305 / 378   | 654 / 731   | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 0 / 0        | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/newsletter`                             | 768   | browser-defaults | 5/5 | 26 / 67  | 96 / 160  | 257 / 381   | 605 / 742   | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 0 / 56       | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/newsletter`                             | 768   | playwright       | 5/5 | 30 / 35  | 96 / 108  | 293 / 296   | 645 / 646   | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 0 / 0        | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/newsletter`                             | 1024  | browser-defaults | 5/5 | 31 / 69  | 96 / 140  | 292 / 395   | 647 / 749   | 0.1298 / 0.1299 | 0.1298 / 0.1299    | 0 / 50       | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/newsletter`                             | 1024  | playwright       | 5/5 | 24 / 48  | 100 / 120 | 280 / 402   | 638 / 759   | 0.1298 / 0.1299 | 0.1298 / 0.1299    | 50 / 53      | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/newsletter`                             | 1280  | browser-defaults | 5/5 | 35 / 38  | 104 / 132 | 269 / 317   | 620 / 668   | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 0 / 53       | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/newsletter`                             | 1280  | playwright       | 5/5 | 26 / 38  | 104 / 128 | 273 / 322   | 623 / 676   | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 0 / 53       | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/content/writing/:id`                    | 390   | browser-defaults | 5/5 | 20 / 43  | 92 / 108  | 242 / 377   | 334 / 516   | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 0 / 0        | 59 / 59  | 712   | 2 / 2                | 3 / 3               |
| `/content/writing/:id`                    | 390   | playwright       | 5/5 | 26 / 38  | 112 / 132 | 290 / 380   | 377 / 461   | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 0 / 0        | 59 / 59  | 712   | 2 / 2                | 2 / 3               |
| `/content/writing/:id`                    | 768   | browser-defaults | 5/5 | 22 / 25  | 80 / 104  | 238 / 287   | 333 / 374   | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 0 / 0        | 59 / 59  | 712   | 2 / 2                | 2 / 2               |
| `/content/writing/:id`                    | 768   | playwright       | 5/5 | 22 / 41  | 100 / 116 | 314 / 332   | 396 / 413   | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 0 / 0        | 59 / 59  | 712   | 2 / 2                | 2 / 3               |
| `/content/writing/:id`                    | 1024  | browser-defaults | 5/5 | 22 / 28  | 84 / 104  | 226 / 298   | 315 / 391   | 0.1299 / 0.1299 | 0.1299 / 0.1299    | 0 / 0        | 59 / 59  | 712   | 2 / 2                | 3 / 3               |
| `/content/writing/:id`                    | 1024  | playwright       | 5/5 | 18 / 44  | 96 / 120  | 266 / 292   | 363 / 380   | 0.1299 / 0.1299 | 0.1299 / 0.1299    | 0 / 0        | 59 / 59  | 712   | 2 / 2                | 2 / 3               |
| `/content/writing/:id`                    | 1280  | browser-defaults | 5/5 | 18 / 25  | 88 / 116  | 257 / 391   | 339 / 502   | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 0 / 0        | 59 / 59  | 712   | 2 / 2                | 2 / 3               |
| `/content/writing/:id`                    | 1280  | playwright       | 5/5 | 20 / 46  | 88 / 128  | 279 / 358   | 360 / 502   | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 0 / 0        | 59 / 59  | 712   | 2 / 2                | 2 / 3               |
| `/operations/observability?view=machines` | 390   | browser-defaults | 5/5 | 14 / 29  | 92 / 128  | 225 / 426   | 228 / 430   | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 0 / 0        | 50 / 50  | 228   | 0 / 0                | 0 / 0               |
| `/operations/observability?view=machines` | 390   | playwright       | 5/5 | 17 / 21  | 84 / 128  | 230 / 503   | 234 / 507   | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 0 / 0        | 50 / 50  | 228   | 0 / 0                | 0 / 0               |
| `/operations/observability?view=machines` | 768   | browser-defaults | 5/5 | 13 / 20  | 80 / 104  | 220 / 293   | 223 / 298   | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 0 / 0        | 50 / 50  | 228   | 0 / 0                | 0 / 0               |
| `/operations/observability?view=machines` | 768   | playwright       | 5/5 | 17 / 28  | 88 / 112  | 225 / 519   | 228 / 524   | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 0 / 0        | 50 / 50  | 228   | 0 / 0                | 0 / 0               |
| `/operations/observability?view=machines` | 1024  | browser-defaults | 5/5 | 14 / 16  | 84 / 96   | 214 / 266   | 215 / 267   | 0.1299 / 0.1299 | 0.1299 / 0.1299    | 0 / 0        | 50 / 50  | 228   | 0 / 0                | 0 / 0               |
| `/operations/observability?view=machines` | 1024  | playwright       | 5/5 | 19 / 24  | 96 / 128  | 244 / 256   | 246 / 257   | 0.1298 / 0.1299 | 0.1298 / 0.1299    | 0 / 0        | 50 / 50  | 228   | 0 / 0                | 0 / 0               |
| `/operations/observability?view=machines` | 1280  | browser-defaults | 5/5 | 15 / 17  | 84 / 100  | 215 / 237   | 216 / 238   | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 0 / 0        | 50 / 50  | 228   | 0 / 0                | 0 / 0               |
| `/operations/observability?view=machines` | 1280  | playwright       | 5/5 | 15 / 20  | 92 / 100  | 236 / 296   | 237 / 298   | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 0 / 0        | 50 / 50  | 228   | 0 / 0                | 0 / 0               |
| `/life`                                   | 390   | browser-defaults | 5/5 | 20 / 43  | 112 / 128 | 242 / 347   | 248 / 349   | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 0 / 0        | 54 / 54  | 240   | 0 / 0                | 0 / 0               |
| `/life`                                   | 390   | playwright       | 5/5 | 24 / 69  | 108 / 148 | 244 / 299   | 250 / 301   | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 0 / 0        | 54 / 54  | 240   | 0 / 0                | 0 / 0               |
| `/life`                                   | 768   | browser-defaults | 5/5 | 14 / 19  | 92 / 100  | 217 / 269   | 219 / 271   | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 0 / 0        | 54 / 54  | 240   | 0 / 0                | 0 / 0               |
| `/life`                                   | 768   | playwright       | 5/5 | 15 / 16  | 92 / 100  | 214 / 242   | 215 / 249   | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 0 / 0        | 54 / 54  | 240   | 0 / 0                | 0 / 0               |
| `/life`                                   | 1024  | browser-defaults | 5/5 | 15 / 20  | 88 / 100  | 226 / 267   | 226 / 267   | 0.1298 / 0.1378 | 0.1298 / 0.1378    | 0 / 0        | 54 / 54  | 240   | 0 / 0                | 0 / 0               |
| `/life`                                   | 1024  | playwright       | 5/5 | 14 / 17  | 92 / 104  | 255 / 287   | 255 / 287   | 0.1299 / 0.1378 | 0.1299 / 0.1378    | 0 / 0        | 54 / 54  | 240   | 0 / 0                | 0 / 0               |
| `/life`                                   | 1280  | browser-defaults | 5/5 | 15 / 25  | 88 / 172  | 223 / 300   | 223 / 300   | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 0 / 0        | 54 / 54  | 240   | 0 / 0                | 0 / 0               |
| `/life`                                   | 1280  | playwright       | 5/5 | 16 / 32  | 104 / 112 | 219 / 240   | 219 / 240   | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 0 / 0        | 54 / 54  | 240   | 0 / 0                | 0 / 0               |
| `/life/health`                            | 390   | browser-defaults | 5/5 | 26 / 42  | 100 / 160 | 244 / 464   | 246 / 469   | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 0 / 0        | 47 / 47  | 211   | 0 / 0                | 0 / 0               |
| `/life/health`                            | 390   | playwright       | 5/5 | 31 / 59  | 104 / 124 | 214 / 264   | 216 / 266   | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 0 / 0        | 47 / 47  | 211   | 0 / 0                | 0 / 0               |
| `/life/health`                            | 768   | browser-defaults | 5/5 | 18 / 22  | 84 / 92   | 238 / 330   | 240 / 333   | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 0 / 0        | 47 / 47  | 211   | 0 / 0                | 0 / 0               |
| `/life/health`                            | 768   | playwright       | 5/5 | 19 / 34  | 100 / 132 | 236 / 282   | 238 / 285   | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 0 / 0        | 47 / 47  | 211   | 0 / 0                | 0 / 0               |
| `/life/health`                            | 1024  | browser-defaults | 5/5 | 22 / 35  | 112 / 128 | 266 / 354   | 266 / 354   | 0.1298 / 0.1299 | 0.1298 / 0.1299    | 0 / 0        | 47 / 47  | 211   | 0 / 0                | 0 / 0               |
| `/life/health`                            | 1024  | playwright       | 5/5 | 19 / 159 | 88 / 236  | 214 / 371   | 214 / 371   | 0.1299 / 0.1378 | 0.1299 / 0.1378    | 0 / 0        | 47 / 47  | 211   | 0 / 0                | 0 / 0               |
| `/life/health`                            | 1280  | browser-defaults | 5/5 | 20 / 24  | 96 / 120  | 236 / 376   | 236 / 376   | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 0 / 0        | 47 / 47  | 211   | 0 / 0                | 0 / 0               |
| `/life/health`                            | 1280  | playwright       | 5/5 | 20 / 31  | 96 / 108  | 242 / 274   | 242 / 274   | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 0 / 0        | 47 / 47  | 211   | 0 / 0                | 0 / 0               |

### Switches

| workspace  | step              | width | mode             | ok  | documents | proxy documents | first change | settled   | INP (max event)  | CLS             | layout shift total | requests | loading visible | status regions (old) | announcements (new) |
| ---------- | ----------------- | ----- | ---------------- | --- | --------- | --------------- | ------------ | --------- | ---------------- | --------------- | ------------------ | -------- | --------------- | -------------------- | ------------------- |
| Content    | Writing           | 390   | browser-defaults | 5/5 | 5/5       | 1 / 1           | 112 / 123    | 621 / 819 | 24 / 24 (2 of 5) | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Writing           | 390   | playwright       | 5/5 | 5/5       | 1 / 1           | 93 / 113     | 595 / 622 | 24 / 24 (1 of 5) | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Writing           | 768   | browser-defaults | 5/5 | 5/5       | 1 / 1           | 113 / 115    | 614 / 623 | 24 / 24 (1 of 5) | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Writing           | 768   | playwright       | 5/5 | 5/5       | 1 / 1           | 100 / 109    | 613 / 695 | 24 / 32 (3 of 5) | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Writing           | 1024  | browser-defaults | 5/5 | 5/5       | 1 / 1           | 117 / 238    | 680 / 807 | 72 / 96          | 0.1299 / 0.1299 | 0.1299 / 0.1299    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Writing           | 1024  | playwright       | 5/5 | 5/5       | 1 / 1           | 85 / 109     | 614 / 726 | 64 / 64          | 0.1299 / 0.1320 | 0.1299 / 0.1320    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Writing           | 1280  | browser-defaults | 5/5 | 5/5       | 1 / 1           | 97 / 137     | 590 / 662 | 24 / 32          | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Writing           | 1280  | playwright       | 5/5 | 5/5       | 1 / 1           | 98 / 122     | 608 / 735 | 24 / 24          | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Pages             | 390   | browser-defaults | 5/5 | 5/5       | 1 / 1           | 102 / 223    | 622 / 745 | 32 / 32 (3 of 5) | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Pages             | 390   | playwright       | 5/5 | 5/5       | 1 / 1           | 98 / 250     | 590 / 761 | 32 / 32 (3 of 5) | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Pages             | 768   | browser-defaults | 5/5 | 5/5       | 1 / 1           | 101 / 123    | 631 / 791 | 32 / 32          | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Pages             | 768   | playwright       | 5/5 | 5/5       | 1 / 1           | 101 / 449    | 640 / 966 | 32 / 32 (4 of 5) | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Pages             | 1024  | browser-defaults | 5/5 | 5/5       | 1 / 1           | 101 / 149    | 622 / 828 | 32 / 32          | 0.1298 / 0.1299 | 0.1298 / 0.1299    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Pages             | 1024  | playwright       | 5/5 | 5/5       | 1 / 1           | 93 / 97      | 579 / 624 | 32 / 32          | 0.1299 / 0.1299 | 0.1299 / 0.1299    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Pages             | 1280  | browser-defaults | 5/5 | 5/5       | 1 / 1           | 97 / 105     | 601 / 734 | 32 / 32          | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Pages             | 1280  | playwright       | 5/5 | 5/5       | 1 / 1           | 105 / 241    | 608 / 894 | 24 / 32          | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Projects          | 390   | browser-defaults | 5/5 | 5/5       | 1 / 1           | 102 / 118    | 655 / 776 | 32 / 32 (2 of 5) | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Projects          | 390   | playwright       | 5/5 | 5/5       | 1 / 1           | 124 / 165    | 812 / 876 | 32 / 32          | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Projects          | 768   | browser-defaults | 5/5 | 5/5       | 1 / 1           | 129 / 186    | 731 / 881 | 28 / 32 (4 of 5) | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Projects          | 768   | playwright       | 5/5 | 5/5       | 1 / 1           | 101 / 102    | 668 / 724 | 32 / 32 (2 of 5) | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Projects          | 1024  | browser-defaults | 5/5 | 5/5       | 1 / 1           | 113 / 125    | 682 / 729 | 32 / 32          | 0.1350 / 0.1350 | 0.1350 / 0.1350    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Projects          | 1024  | playwright       | 5/5 | 5/5       | 1 / 1           | 101 / 173    | 728 / 942 | 32 / 32          | 0.1374 / 0.1374 | 0.1374 / 0.1374    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Projects          | 1280  | browser-defaults | 5/5 | 5/5       | 1 / 1           | 117 / 177    | 674 / 785 | 32 / 32          | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Projects          | 1280  | playwright       | 5/5 | 5/5       | 1 / 1           | 105 / 133    | 698 / 854 | 32 / 32          | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Newsletter        | 390   | browser-defaults | 5/5 | 5/5       | 1 / 1           | 104 / 118    | 584 / 771 | 32 / 32 (2 of 5) | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Newsletter        | 390   | playwright       | 5/5 | 5/5       | 1 / 1           | 102 / 104    | 650 / 785 | 32 / 32 (3 of 5) | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Newsletter        | 768   | browser-defaults | 5/5 | 5/5       | 1 / 1           | 102 / 119    | 582 / 610 | 32 / 32 (3 of 5) | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Newsletter        | 768   | playwright       | 5/5 | 5/5       | 1 / 1           | 130 / 134    | 628 / 786 | 32 / 32 (3 of 5) | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Newsletter        | 1024  | browser-defaults | 5/5 | 5/5       | 1 / 1           | 105 / 113    | 581 / 647 | 32 / 32          | 0.1299 / 0.1299 | 0.1299 / 0.1299    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Newsletter        | 1024  | playwright       | 5/5 | 5/5       | 1 / 1           | 101 / 122    | 590 / 609 | 32 / 32          | 0.1299 / 0.1299 | 0.1299 / 0.1299    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Newsletter        | 1280  | browser-defaults | 5/5 | 5/5       | 1 / 1           | 89 / 101     | 576 / 589 | 32 / 32          | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Newsletter        | 1280  | playwright       | 5/5 | 5/5       | 1 / 1           | 101 / 117    | 627 / 672 | 32 / 32          | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Library to record | 390   | browser-defaults | 5/5 | 5/5       | 1 / 1           | 77 / 94      | 312 / 313 | none reported    | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 59 / 59  | 250 / 261       | 2 / 2                | 2 / 3               |
| Content    | Library to record | 390   | playwright       | 5/5 | 5/5       | 1 / 1           | 77 / 90      | 313 / 350 | none reported    | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 59 / 59  | 256 / 292       | 2 / 2                | 3 / 3               |
| Content    | Library to record | 768   | browser-defaults | 5/5 | 5/5       | 1 / 1           | 90 / 97      | 311 / 317 | none reported    | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 59 / 59  | 249 / 264       | 2 / 2                | 2 / 3               |
| Content    | Library to record | 768   | playwright       | 5/5 | 5/5       | 1 / 1           | 78 / 110     | 314 / 356 | none reported    | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 59 / 59  | 261 / 286       | 2 / 2                | 2 / 3               |
| Content    | Library to record | 1024  | browser-defaults | 5/5 | 5/5       | 1 / 1           | 94 / 137     | 356 / 392 | 24 / 24 (1 of 5) | 0.1299 / 0.1299 | 0.1299 / 0.1299    | 59 / 59  | 279 / 326       | 2 / 2                | 2 / 3               |
| Content    | Library to record | 1024  | playwright       | 5/5 | 5/5       | 1 / 1           | 77 / 110     | 320 / 362 | 32 / 32 (1 of 5) | 0.1298 / 0.1299 | 0.1298 / 0.1299    | 59 / 59  | 264 / 294       | 2 / 2                | 3 / 3               |
| Content    | Library to record | 1280  | browser-defaults | 5/5 | 5/5       | 1 / 1           | 77 / 98      | 312 / 401 | none reported    | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 59 / 59  | 259 / 335       | 2 / 2                | 3 / 3               |
| Content    | Library to record | 1280  | playwright       | 5/5 | 5/5       | 1 / 1           | 82 / 106     | 331 / 362 | none reported    | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 59 / 59  | 265 / 299       | 2 / 2                | 3 / 3               |
| Content    | Record to library | 390   | browser-defaults | 5/5 | 5/5       | 1 / 1           | 81 / 93      | 554 / 603 | 24 / 32          | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Record to library | 390   | playwright       | 5/5 | 5/5       | 1 / 1           | 102 / 113    | 599 / 602 | 24 / 32          | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Record to library | 768   | browser-defaults | 5/5 | 5/5       | 1 / 1           | 73 / 86      | 582 / 596 | 32 / 32          | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Record to library | 768   | playwright       | 5/5 | 5/5       | 1 / 1           | 86 / 102     | 598 / 600 | 32 / 32          | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Record to library | 1024  | browser-defaults | 5/5 | 5/5       | 1 / 1           | 98 / 102     | 598 / 673 | 32 / 32 (4 of 5) | 0.1298 / 0.1317 | 0.1298 / 0.1317    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Record to library | 1024  | playwright       | 5/5 | 5/5       | 1 / 1           | 102 / 126    | 627 / 696 | 32 / 32          | 0.1299 / 0.1299 | 0.1299 / 0.1299    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Record to library | 1280  | browser-defaults | 5/5 | 5/5       | 1 / 1           | 101 / 105    | 589 / 675 | 32 / 32 (4 of 5) | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Record to library | 1280  | playwright       | 5/5 | 5/5       | 1 / 1           | 97 / 101     | 591 / 757 | 32 / 32          | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Operations | Loops             | 390   | browser-defaults | 5/5 | 5/5       | 1 / 1           | 93 / 138     | 212 / 272 | 24 / 24 (3 of 5) | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 50 / 50  | 0 / 0           | 0 / 0                | 0 / 0               |
| Operations | Loops             | 390   | playwright       | 5/5 | 5/5       | 1 / 1           | 89 / 123     | 205 / 263 | 24 / 32 (4 of 5) | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 50 / 50  | 0 / 0           | 0 / 0                | 0 / 0               |
| Operations | Loops             | 768   | browser-defaults | 5/5 | 5/5       | 1 / 1           | 82 / 147     | 181 / 281 | 24 / 32 (3 of 5) | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 50 / 50  | 0 / 0           | 0 / 0                | 0 / 0               |
| Operations | Loops             | 768   | playwright       | 5/5 | 5/5       | 1 / 1           | 89 / 98      | 198 / 231 | 24 / 24 (2 of 5) | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 50 / 50  | 0 / 0           | 0 / 0                | 0 / 0               |
| Operations | Loops             | 1024  | browser-defaults | 5/5 | 5/5       | 1 / 1           | 81 / 97      | 199 / 211 | 60 / 64 (4 of 5) | 0.1299 / 0.1299 | 0.1299 / 0.1299    | 50 / 50  | 0 / 0           | 0 / 0                | 0 / 0               |
| Operations | Loops             | 1024  | playwright       | 5/5 | 5/5       | 1 / 1           | 89 / 310     | 227 / 438 | 56 / 64          | 0.1298 / 0.1299 | 0.1298 / 0.1299    | 50 / 50  | 0 / 0           | 0 / 0                | 0 / 0               |
| Operations | Loops             | 1280  | browser-defaults | 5/5 | 5/5       | 1 / 1           | 97 / 101     | 202 / 280 | 28 / 32 (4 of 5) | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 50 / 50  | 0 / 0           | 0 / 0                | 0 / 0               |
| Operations | Loops             | 1280  | playwright       | 5/5 | 5/5       | 1 / 1           | 97 / 109     | 235 / 270 | 24 / 32 (4 of 5) | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 50 / 50  | 0 / 0           | 0 / 0                | 0 / 0               |
| Life       | People            | 390   | browser-defaults | 5/5 | 5/5       | 1 / 1           | 84 / 97      | 197 / 296 | 24 / 24 (4 of 5) | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 54 / 54  | 0 / 0           | 0 / 0                | 0 / 0               |
| Life       | People            | 390   | playwright       | 5/5 | 5/5       | 1 / 1           | 97 / 116     | 221 / 246 | 32 / 32          | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 54 / 54  | 0 / 0           | 0 / 0                | 0 / 0               |
| Life       | People            | 768   | browser-defaults | 5/5 | 5/5       | 1 / 1           | 82 / 99      | 246 / 579 | 24 / 24 (1 of 5) | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 54 / 54  | 0 / 0           | 0 / 0                | 0 / 0               |
| Life       | People            | 768   | playwright       | 5/5 | 5/5       | 1 / 1           | 81 / 93      | 200 / 241 | 32 / 32 (3 of 5) | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 54 / 54  | 0 / 0           | 0 / 0                | 0 / 0               |
| Life       | People            | 1024  | browser-defaults | 5/5 | 5/5       | 1 / 1           | 93 / 97      | 211 / 298 | 56 / 64          | 0.1298 / 0.1299 | 0.1298 / 0.1299    | 54 / 54  | 0 / 0           | 0 / 0                | 0 / 0               |
| Life       | People            | 1024  | playwright       | 5/5 | 5/5       | 1 / 1           | 77 / 119     | 180 / 260 | 56 / 96          | 0.1298 / 0.1299 | 0.1298 / 0.1299    | 54 / 54  | 0 / 0           | 0 / 0                | 0 / 0               |
| Life       | People            | 1280  | browser-defaults | 5/5 | 5/5       | 1 / 1           | 82 / 94      | 186 / 231 | 24 / 24          | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 54 / 54  | 0 / 0           | 0 / 0                | 0 / 0               |
| Life       | People            | 1280  | playwright       | 5/5 | 5/5       | 1 / 1           | 85 / 217     | 218 / 322 | 24 / 24 (4 of 5) | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 54 / 54  | 0 / 0           | 0 / 0                | 0 / 0               |
| Life       | Timeline          | 390   | browser-defaults | 5/5 | 5/5       | 1 / 1           | 80 / 83      | 205 / 337 | 32 / 32          | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 54 / 54  | 0 / 0           | 0 / 0                | 0 / 0               |
| Life       | Timeline          | 390   | playwright       | 5/5 | 5/5       | 1 / 1           | 80 / 83      | 182 / 207 | 32 / 32          | 0.0664 / 0.0664 | 0.0664 / 0.0664    | 54 / 54  | 0 / 0           | 0 / 0                | 0 / 0               |
| Life       | Timeline          | 768   | browser-defaults | 5/5 | 5/5       | 1 / 1           | 83 / 140     | 221 / 443 | 32 / 32          | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 54 / 54  | 0 / 0           | 0 / 0                | 0 / 0               |
| Life       | Timeline          | 768   | playwright       | 5/5 | 5/5       | 1 / 1           | 71 / 85      | 183 / 207 | 32 / 32          | 0.0547 / 0.0547 | 0.0547 / 0.0547    | 54 / 54  | 0 / 0           | 0 / 0                | 0 / 0               |
| Life       | Timeline          | 1024  | browser-defaults | 5/5 | 5/5       | 1 / 1           | 77 / 101     | 197 / 240 | 32 / 32          | 0.1299 / 0.1299 | 0.1299 / 0.1299    | 54 / 54  | 0 / 0           | 0 / 0                | 0 / 0               |
| Life       | Timeline          | 1024  | playwright       | 5/5 | 5/5       | 1 / 1           | 85 / 89      | 191 / 251 | 32 / 32          | 0.1298 / 0.1299 | 0.1298 / 0.1299    | 54 / 54  | 0 / 0           | 0 / 0                | 0 / 0               |
| Life       | Timeline          | 1280  | browser-defaults | 5/5 | 5/5       | 1 / 1           | 97 / 101     | 226 / 439 | 32 / 32          | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 54 / 54  | 0 / 0           | 0 / 0                | 0 / 0               |
| Life       | Timeline          | 1280  | playwright       | 5/5 | 5/5       | 1 / 1           | 81 / 121     | 200 / 329 | 32 / 32          | 0.0000 / 0.0000 | 0.0000 / 0.0000    | 54 / 54  | 0 / 0           | 0 / 0                | 0 / 0               |

### Playwright defaults versus browser defaults

Pooled over every switch step and width (180 step runs per mode), first change
was 97 / 121 ms with Playwright defaults and 97 / 118 ms with
`--browser-defaults`; 70 and 71 runs were over 100 ms. Load FCP was 100 / 132
and 96 / 132 ms. Per step the median moved by less than 15 ms either way
(Writing +15, Projects +14, Record to library -14, every other step within
4 ms). On loopback, turning PaintHolding and the back-forward cache on does
not move first change or FCP beyond run noise. Production, where a document
waits on the network, is where PaintHolding can matter; only the owner's
signed-in capture (decision 5) shows it.

The back-forward cache does change history: `back:content` restored `/content`
from the cache with no document request under `--browser-defaults`, and made a
52-request document navigation under Playwright defaults, even though admin
documents send `Cache-Control: private, no-store`. S18 depends on this.

### Announcements, old and new definition

Same runs, both definitions:

| cell                                | old "status regions" | new announcements           | Astryx announcements | alert announcements |
| ----------------------------------- | -------------------- | --------------------------- | -------------------- | ------------------- |
| `load:record`, every width and mode | 2 in 40 of 40 runs   | 2 in 26, 3 in 14 of 40 runs | 0                    | 1 in 40 of 40       |
| `switch:record` Library to record   | 2 in 40 of 40 runs   | 2 in 22, 3 in 18 of 40 runs | 0                    | 1 in 40 of 40       |
| every other load and switch cell    | 0                    | 0                           | 0                    | 0                   |

The restated "today" value for S10 and S16 is therefore **2 to 3
announcements** on a record open under the new definition, where the old
definition read "2 status regions". Every run has one assertive announcement,
the `editor_not_configured` message the local 503 produces. The rest are the
two `AdminSkeleton` mounts (`EditorialApp`, then `HomeEditor`), which count
once when both texts land in the same frame and twice when they do not. With
the S9 fixture editor the alert goes away, so S10 should expect 1 to 2 before
its change and exactly 1 after. No Astryx polite region exists on any route
today (`liveRegions.astryxPolite` is 0 everywhere), so R4's "exactly one"
assertion has nothing to count until a wait uses `useAnnounce`.

### Touch at 390

`--inputs touch`, 3 runs after no warm-up, both modes interleaved:

Initial load:

| route                  | width | mode             | ok  | TTFB    | FCP       | interactive | settled     | CLS             | layout shift total | long task ms | requests | JS KB | status regions (old) | announcements (new) |
| ---------------------- | ----- | ---------------- | --- | ------- | --------- | ----------- | ----------- | --------------- | ------------------ | ------------ | -------- | ----- | -------------------- | ------------------- |
| `/content`             | 390   | browser-defaults | 3/3 | 57 / 59 | 132 / 140 | 326 / 357   | 1006 / 1008 | 0.0000 / 0.0000 | 0.0664 / 0.0664    | 343 / 375    | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/content`             | 390   | playwright       | 3/3 | 49 / 70 | 128 / 132 | 326 / 331   | 994 / 1007  | 0.0000 / 0.0000 | 0.0664 / 0.0664    | 362 / 370    | 52 / 52  | 295   | 0 / 0                | 0 / 0               |
| `/content/writing/:id` | 390   | browser-defaults | 3/3 | 18 / 23 | 88 / 100  | 248 / 254   | 334 / 338   | 0.0000 / 0.0000 | 0.0664 / 0.0664    | 0 / 0        | 59 / 59  | 712   | 2 / 2                | 2 / 2               |
| `/content/writing/:id` | 390   | playwright       | 3/3 | 24 / 24 | 84 / 92   | 247 / 257   | 327 / 365   | 0.0000 / 0.0000 | 0.0664 / 0.0664    | 0 / 0        | 59 / 59  | 712   | 2 / 2                | 3 / 3               |

Switches:

| workspace  | step              | width | mode             | ok  | documents | proxy documents | first change | settled    | INP (max event)  | CLS             | layout shift total | requests | loading visible | status regions (old) | announcements (new) |
| ---------- | ----------------- | ----- | ---------------- | --- | --------- | --------------- | ------------ | ---------- | ---------------- | --------------- | ------------------ | -------- | --------------- | -------------------- | ------------------- |
| Content    | Writing           | 390   | browser-defaults | 3/3 | 3/3       | 1 / 1           | 126 / 175    | 631 / 639  | 24 / 32          | 0.0000 / 0.0000 | 0.0664 / 0.0664    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Writing           | 390   | playwright       | 3/3 | 3/3       | 1 / 1           | 124 / 153    | 601 / 640  | 32 / 32          | 0.0000 / 0.0000 | 0.0664 / 0.0664    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Pages             | 390   | browser-defaults | 3/3 | 3/3       | 1 / 1           | 105 / 121    | 578 / 579  | 32 / 32          | 0.0000 / 0.0000 | 0.0664 / 0.0664    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Pages             | 390   | playwright       | 3/3 | 3/3       | 1 / 1           | 100 / 104    | 587 / 1419 | 24 / 24          | 0.0000 / 0.0664 | 0.0664 / 0.0664    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Projects          | 390   | browser-defaults | 3/3 | 3/3       | 1 / 1           | 123 / 134    | 662 / 674  | 32 / 32          | 0.0000 / 0.0000 | 0.0664 / 0.0664    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Projects          | 390   | playwright       | 3/3 | 3/3       | 1 / 1           | 103 / 119    | 664 / 684  | 24 / 32          | 0.0000 / 0.0000 | 0.0664 / 0.0664    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Newsletter        | 390   | browser-defaults | 3/3 | 3/3       | 1 / 1           | 108 / 141    | 596 / 611  | 28 / 32 (2 of 3) | 0.0000 / 0.0000 | 0.0664 / 0.0664    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Newsletter        | 390   | playwright       | 3/3 | 3/3       | 1 / 1           | 87 / 121     | 560 / 567  | 32 / 32          | 0.0000 / 0.0000 | 0.0664 / 0.0664    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Library to record | 390   | browser-defaults | 3/3 | 3/3       | 1 / 1           | 104 / 120    | 327 / 330  | none reported    | 0.0000 / 0.0000 | 0.0664 / 0.0664    | 59 / 59  | 243 / 244       | 2 / 2                | 2 / 2               |
| Content    | Library to record | 390   | playwright       | 3/3 | 3/3       | 1 / 1           | 99 / 107     | 330 / 337  | none reported    | 0.0000 / 0.0000 | 0.0664 / 0.0664    | 59 / 59  | 251 / 254       | 2 / 2                | 2 / 3               |
| Content    | Record to library | 390   | browser-defaults | 3/3 | 3/3       | 1 / 1           | 104 / 104    | 574 / 590  | 32 / 32          | 0.0000 / 0.0000 | 0.0664 / 0.0664    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Content    | Record to library | 390   | playwright       | 3/3 | 3/3       | 1 / 1           | 103 / 104    | 606 / 760  | 32 / 32          | 0.0000 / 0.0000 | 0.0664 / 0.0664    | 52 / 52  | 0 / 0           | 0 / 0                | 0 / 0               |
| Operations | Loops             | 390   | browser-defaults | 3/3 | 3/3       | 1 / 1           | 104 / 119    | 220 / 223  | 32 / 32          | 0.0000 / 0.0000 | 0.0664 / 0.0664    | 50 / 50  | 0 / 0           | 0 / 0                | 0 / 0               |
| Operations | Loops             | 390   | playwright       | 3/3 | 3/3       | 1 / 1           | 105 / 107    | 207 / 233  | 32 / 32          | 0.0000 / 0.0000 | 0.0664 / 0.0664    | 50 / 50  | 0 / 0           | 0 / 0                | 0 / 0               |

Under touch emulation CLS reads 0 at 390 while `layoutShiftTotal` still reads
0.0664, the same shift the mouse cells report as CLS. Chromium's CLS window
excludes those entries in the emulated phone context (cause not isolated).
This is why section 8 bounds `layoutShiftTotal` as well as CLS: at 390 a slice
must report both, and a touch CLS of 0 proves nothing about the AppShell bar.
Touch first change is 87 to 126 ms against 77 to 124 ms with the mouse on the
same steps, 3 runs.

### Dwell

The unread 503 body no longer forces a 15 s dwell, so Record to library now
settles like every other step: 98 and 101 ms first change at 1024 and 1280, 81
and 73 ms at 390 and 768 under `--browser-defaults` (table above). With
`--dwells 15` on the committed baseline's build (A/B, battery, 5 runs) Record
to library read 219 to 234 ms and Library to record 271 to 293 ms, against 100 to
140 ms from the old harness, which never dwelt before that step, so the idle-dwell document penalty is real and large on
this machine in this state. The 60 s dwell cell was not run before the battery
ran low; `--dwells 0,4,15,60 --cells switch:record` measures the full curve.

### Idle, intent, warm-cache and back cells

One run per mode, `origin/main`, counting proxy on:

| cell                               | width, input | result, both modes                                                                                                         |
| ---------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `idle:content` 120 s               | 1280, mouse  | 0 requests, 0 documents, 0 speculative, 0 unexplained                                                                      |
| `idle:operations` 125 s            | 1280, mouse  | 0 requests (Operations is unconfigured locally, so 0 is the expected count; connected would be 2)                          |
| `intent:hover` 53 targets, 10 s    | 1280, mouse  | 0 record reads, 0 scripts, 0 documents                                                                                     |
| `intent:press-cancel`              | 1280, mouse  | 0 record reads, no navigation                                                                                              |
| `intent:touch-scroll` 100 gestures | 390, touch   | 0 record reads started, no navigation                                                                                      |
| `intent:drag-select` 50 gestures   | 1280, mouse  | 0 record reads, 0 aborted before first byte, no navigation                                                                 |
| `intent:right-click` 50 presses    | 1280, mouse  | 0 record reads, no navigation                                                                                              |
| `warm:content`                     | 1280, mouse  | 52 requests, 50 `/_astro` resources, 0 from cache, 0 revalidated                                                           |
| `back:content`                     | 1280, mouse  | `browser-defaults` restored from the back-forward cache with 0 documents; `playwright` loaded a new document (52 requests) |

Today there is no prefetch, so every intent count is 0; S17 turns these into
its acceptance. `warm:content` is S7's starting point: 0 of 50 assets come from
cache.

### Counting proxy

Across every proxied run in the JSON, the proxy saw 0 speculative requests and
0 unexplained upstream requests, and its document count matched
`documentRequest` on every step (a mismatch fails the run, and none failed).
It did see Chromium's own background traffic to other origins (for example
CONNECT to Google services, 8 to 20 per idle cell), which it refuses and
reports as `proxy.external`. Without the proxy that traffic goes to the
network directly, which is one more reason loopback absolutes are noisy.

## Limitations

- Power: see the first section. Absolute timings in this file are low power
  mode upper bounds.
- Light theme only in the re-baseline. The committed baseline showed no theme
  effect on any median, and the harness still runs dark with `--themes`.
- 5 runs per group (touch 3, fixed cells 1). A p90 from 5 runs is the slowest
  run.
- Loopback with local fixtures: no Access, edge, network round trip or real
  Durable Object and GitHub reads, and `/api/editorial/record` answers 503.
- The proxy adds a loopback hop to every request in the re-baseline passes;
  it was not separately priced because the plugged-in overhead run could not
  happen. Compare proxied runs with proxied runs.

## What only production can prove

The owner's signed-in headed capture (decision 5) is still the only evidence
for: whether PaintHolding changes first change when documents wait on real
network and Access, the 110 to 165 ms production document estimate (R9), record
read latency (R10), and how the Access session expiry surfaces (R6). Nothing in
this slice deploys; deploy targets are none.

## Rerun

Plugged in, with the 1-minute load under 8:

```bash
cd <worktree> && export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
ADMIN_LOCAL_OWNER_PORT=8881 pnpm preview:admin:owner   # terminal 1
node scripts/admin/perf-measure.mjs .local/perf/rebaseline.json \
  --base http://127.0.0.1:8881 --runs 5 --warmup 1 --interleave \
  --widths 390,768,1024,1280 --themes light \
  --browser-modes playwright,browser-defaults --proxy
node scripts/admin/perf-measure.mjs .local/perf/touch.json \
  --base http://127.0.0.1:8881 --runs 5 --warmup 1 --interleave \
  --widths 390 --themes light --inputs touch \
  --browser-modes playwright,browser-defaults --proxy
node scripts/admin/perf-measure.mjs .local/perf/dwell.json \
  --base http://127.0.0.1:8881 --runs 5 --interleave --widths 1280 \
  --themes light --cells switch:record --dwells 0,4,15,60 \
  --browser-modes playwright,browser-defaults --proxy
node scripts/admin/perf-measure.mjs .local/perf/fixed.json \
  --base http://127.0.0.1:8881 --runs 3 --interleave \
  --browser-modes playwright,browser-defaults --proxy \
  --cells idle:content,idle:operations,intent:hover,intent:press-cancel,intent:touch-scroll,intent:drag-select,intent:right-click,warm:content,back:content
```

The committed baseline's method is `--widths 390,768,1280 --press-gap 0
--runs 7` without `--proxy`, `--warmup` or `--interleave`. `--list` prints
every cell. Stop the preview with Ctrl+C afterwards.
