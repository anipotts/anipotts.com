# writing motion bench

Dev-only measurements for the writing card choreography. Nothing here runs in
CI: headless Chromium with 4x CPU throttling on a shared runner is too noisy
for a hard gate. Every pull request that touches the choreography attaches a
same-session run of the base branch against the pull request head instead.

Playwright is resolved from `apps/admin`, which already carries it as a dev
dependency. Set `PLAYWRIGHT_FROM` to another `package.json` path to override.

## serve both builds

Build each checkout with `pnpm turbo build --filter=@anipotts/www`, then serve
each `apps/www` on its own port:

```bash
npx wrangler dev --local --port 8861 --persist-to /tmp/bench-state-base
npx wrangler dev --local --port 8860 --persist-to /tmp/bench-state-pr
```

## run

```bash
BASE_URL=http://127.0.0.1:8861 PR_URL=http://127.0.0.1:8860 OUT=/tmp/bench \
  pnpm --filter @anipotts/www bench:motion
```

`ROUNDS` (default 2) sets the interleaved rounds. `ONLY` picks stages from
`record,table,sheets,probe,checks`. Stop both servers afterwards.

## scripts

| script        | output                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `record.mjs`  | per step: click to first motion, click to settled, frame intervals, long tasks, screencast frames                                              |
| `table.mjs`   | `table.txt` and `table.json`: every run, per-step ranges and the acceptance checks                                                             |
| `sheet.mjs`   | contact sheets per profile and step, times relative to the click or tap                                                                        |
| `probe.mjs`   | per frame: text layers above 0.3 opacity that intersect, wave wrapper outside the surface clip; after settle: overlays, hidden elements, focus |
| `checks.mjs`  | height-only resize, width resize, stalled animations, reduced motion, light theme, exit to a non-writing page, back mid-flight, frozen tab     |
| `profile.mjs` | CPU profile of the open and close taps, aggregated by function                                                                                 |

## steps and profiles

Each run opens `/writing` in dark theme and performs four steps: open the first
card, close with the back link, open again, close with browser back. Profiles
are desktop 1280 by 800 at 1x CPU with mouse clicks, and iPhone 13 (390 wide)
at 4x CPU with real taps.
