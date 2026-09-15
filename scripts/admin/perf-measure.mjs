#!/usr/bin/env node

// Admin performance harness: initial loads, in-workspace switches, idle and
// intent cells, a warm-cache cell and a back-navigation cell.
//
//   node scripts/admin/perf-measure.mjs <out.json> [options]
//
// It starts no server. Serve Admin first, normally with
// `pnpm preview:admin:owner` from the same worktree, then point this at it.
// Every run opens a fresh Chromium context, so no cache, cookie or storage
// carries from one run to the next.
//
// Options:
//   --base <origin>        loopback origin (default http://127.0.0.1:8871)
//   --runs <n>             measured runs per group (default 5)
//   --widths <list>        viewport widths (default 390,768,1024,1280)
//   --themes <list>        light,dark (default both)
//   --cells <list>         cell ids (default: every load and switch cell);
//                          --list prints them all
//   --md <file>            markdown summary (default: the JSON path with .md)
//   --cpu-throttle <n>     CDP CPU slowdown factor (default 1)
//   --timeout <ms>         budget for each readiness wait (default 30000)
//   --headless-shell       use chrome-headless-shell instead of new headless
//   --browser-defaults     run Chromium with PaintHolding and the back-forward
//                          cache on, which Playwright's defaults turn off
//   --browser-modes <list> playwright,browser-defaults: both, interleaved
//   --press-gap <ms>       pointerdown to pointerup on every press (default
//                          80; 0 reproduces the committed baseline's press)
//   --dwells <seconds>     idle dwell before each switch step (default 0),
//                          for example 0,4,15,60
//   --inputs <list>        mouse,touch; touch emulates a phone (hasTouch,
//                          isMobile) and applies to widths under 768 only
//   --warmup <n>           runs per group measured first and discarded
//   --interleave           run round-robin across groups instead of blocks
//   --proxy                count every browser request through
//                          scripts/admin/perf-proxy.mjs, including
//                          speculation, prerender and Sec-Purpose requests
//   --idle-ms <ms>         override the idle cell durations (smoke runs)
//
// Settling uses readiness checks: a run is settled when the document is
// complete, every client:load island has committed its React hydration, no
// request is in flight and the DOM has been quiet for 300ms. A non-2xx API
// response the page never reads stops counting as in flight once its headers
// arrive, so an unread 503 body no longer holds a step for its 15 s abort.
// The fixed waits are deliberate and reported: --dwells, the 80 ms press gap,
// and the idle and intent observation windows.
//
// The report holds durations, counts, byte sizes, browser feature flags and
// generic route labels. Record routes appear as /content/:collection/:id,
// query strings are dropped, and no page text, record identity, draft or Life
// content is collected. Announcement counts never read the announced text
// into the report.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { classifyRequest, startCountingProxy } from "./perf-proxy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(join(ROOT, "apps/admin/package.json"));

const QUIET_MS = 300;
const INTENT_WINDOW_MS = 1500;
export const HEIGHTS = { 390: 844, 768: 1024, 1024: 900, 1280: 900 };
const REGION_ID = "astryx-app-shell-main";
const CLICK_KEY = "__adminPerfInput";
const BROWSER_MODES = ["playwright", "browser-defaults"];
const INPUTS = ["mouse", "touch"];
const TOUCH_MAX_WIDTH = 767;
// Loading states owned by Astryx and Admin components. Presence only: the probe
// never forces layout to test visibility.
const LOADING_SELECTOR = [
  ".astryx-skeleton",
  ".admin-loading",
  '[aria-busy="true"]',
].join(", ");
const RECORD_PATH =
  /^\/content\/(home|page|work|writing|projects|workPage|writingPage|systemsPage|newsletterPage)\/[^/]+$/;
// Only these launch flags are copied into the report. Paths never are.
const REPORTED_FLAG =
  /^--(disable-features=|enable-features=|disable-back-forward-cache$|proxy-server=|proxy-bypass-list=)/;

const METRIC_DEFINITIONS = {
  ttfbMs:
    "navigation responseStart: response headers received. Astro streams the body afterwards.",
  responseEndMs: "navigation responseEnd: last document byte received.",
  fcpMs: "first-contentful-paint entry.",
  lcpMs: "last largest-contentful-paint candidate before the run settled.",
  dclMs: "domContentLoadedEventEnd.",
  loadMs: "loadEventEnd.",
  hydratedMs:
    "every astro-island[client=load] has dropped its ssr attribute, so Astro has handed each island to React.",
  interactiveMs:
    "every client:load island's React root has committed with hydration finished, read from a React DevTools global hook the harness installs. interactiveSource says when it fell back to React props on the island's first element.",
  settledMs:
    "latest of last DOM mutation, last resource response end, interactive and load, before a 300ms quiet window with no request in flight. A non-2xx API response the page never reads leaves the in-flight set when its headers arrive.",
  cls: "largest session window (1s gap, 5s cap) of layout shifts without recent input.",
  layoutShiftTotal:
    "sum of every layout-shift entry, including those within 500ms of input that CLS ignores.",
  longTaskCount: "longtask entries.",
  longTaskMs: "sum of longtask durations.",
  blockingMs: "sum of longtask time beyond 50ms each.",
  jsTransferBytes:
    "transferSize of .js and .mjs resources (entry scripts, modulepreloads and dynamic imports).",
  jsDecodedBytes: "decodedBodySize of the same resources.",
  requests:
    "requests Playwright observed from the navigation or input until settled, including the document.",
  serverTiming:
    "Server-Timing from the document navigation entry and same-origin /api responses. Worker clocks advance across I/O, so pure CPU work can read as 0.",
  cdp: "Chrome DevTools Protocol Performance.getMetrics, after minus before: TaskDuration, ScriptDuration, LayoutDuration and RecalcStyleDuration in ms, JSHeapUsedSize in bytes after. counterReset means a new document restarted the counters, so the values cover that document only.",
  cachedResources:
    "resources served from the HTTP cache (transferSize 0). revalidatedResources answered a conditional request with a smaller transfer than the body.",
  documentRequest:
    "the switch issued a main-frame document request, counted at the request layer.",
  firstChangeMs:
    "input click to the first frame showing a change in the workspace region. In place: first mutation inside #astryx-app-shell-main, then requestAnimationFrame plus a MessageChannel task. New document: the later of its first-contentful-paint and that same marker.",
  eventMs:
    "largest Event Timing entry (durationThreshold 16) with an interactionId from the input. Null when every entry was under 16ms or the old document unloaded before reporting.",
  loading:
    "time a loading element (.astryx-skeleton, .admin-loading, [aria-busy=true]) was present after the input. maxCount counts loading elements at once, maxAnnouncements (the committed baseline's 'status regions', the old definition) the distinct role=status ancestors of those elements at once, and stillVisible means one was present at settle.",
  announcements:
    "the new definition (design 4.5): after DOMContentLoaded, a non-empty text set on a live region ([aria-live] other than off, role=status, alert or log, outside aria-hidden), observed by one MutationObserver and evaluated once per animation frame, so a clear plus re-set inside one frame counts once and a region inserted with text counts once. total counts every live region; astryx counts regions carrying data-astryx-live-region (Astryx useAnnounce); alert counts role=alert or assertive regions, such as an error Banner.",
  liveRegions:
    "live regions in the document at settle: astryxPolite and astryxAssertive are Astryx useAnnounce regions, status counts role=status elements.",
  pressGapMs:
    "pointerdown to pointerup on every measured press. pointerdownToClickMs reports what the page saw.",
  dwellMs:
    "fixed idle wait after the previous settle and before the step's press. dwellRequests counts requests during it; openBodiesAtPress counts non-2xx bodies still open when the press started.",
  proxy:
    "scripts/admin/perf-proxy.mjs counts for the same window: proxyTotal, proxyDocuments (document requests without Sec-Purpose), speculative (Sec-Purpose prefetch or prerender), notAtProxy (page requests the network never saw, such as cache hits) unexplained (upstream requests without Sec-Purpose that no page request matches, which fails the run) and external (Chromium's own requests to other origins, which the proxy refuses).",
  idle: "requests during a fixed visible wait with no input after the page settled.",
  intent:
    "record reads (/api/editorial/record GET) and other requests caused by hover, press-cancel, touch scroll, drag-select or right-click gestures that never click. cancelled and active counts use a 1500ms window.",
  warm: "a second document in the same context: astroResources and astroFromCache count /_astro resource entries and those with transferSize 0.",
  back: "history back to a document: restoredFromBfcache is pageshow.persisted in the shown document; notRestoredReasons lists Chromium's reason names when it was not restored.",
};

function list(value, label, parse = (item) => item) {
  const items = value.split(",").map((item) => parse(item.trim()));
  if (!items.length || items.some((item) => item === "" || item === undefined))
    throw new Error(`${label} needs a comma-separated list`);
  return items;
}

export function parseArgs(argv) {
  const options = {
    base: "http://127.0.0.1:8871",
    runs: 5,
    widths: [390, 768, 1024, 1280],
    themes: ["light", "dark"],
    cells: null,
    md: null,
    out: null,
    cpuThrottle: 1,
    timeout: 30000,
    headlessShell: false,
    list: false,
    browserModes: ["playwright"],
    pressGapMs: 80,
    dwellsMs: [0],
    inputs: ["mouse"],
    warmup: 0,
    interleave: false,
    proxy: false,
    idleMs: null,
  };
  const value = (index) => {
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--"))
      throw new Error(`${argv[index]} needs a value`);
    return next;
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--list") options.list = true;
    else if (arg === "--headless-shell") options.headlessShell = true;
    else if (arg === "--browser-defaults")
      options.browserModes = ["browser-defaults"];
    else if (arg === "--interleave") options.interleave = true;
    else if (arg === "--proxy") options.proxy = true;
    else if (arg === "--base") options.base = value(index++);
    else if (arg === "--md") options.md = value(index++);
    else if (arg === "--runs") options.runs = Number(value(index++));
    else if (arg === "--warmup") options.warmup = Number(value(index++));
    else if (arg === "--press-gap") options.pressGapMs = Number(value(index++));
    else if (arg === "--idle-ms") options.idleMs = Number(value(index++));
    else if (arg === "--cpu-throttle")
      options.cpuThrottle = Number(value(index++));
    else if (arg === "--timeout") options.timeout = Number(value(index++));
    else if (arg === "--widths")
      options.widths = list(value(index++), "--widths", Number);
    else if (arg === "--themes")
      options.themes = list(value(index++), "--themes");
    else if (arg === "--cells") options.cells = list(value(index++), "--cells");
    else if (arg === "--browser-modes")
      options.browserModes = list(value(index++), "--browser-modes");
    else if (arg === "--inputs")
      options.inputs = list(value(index++), "--inputs");
    else if (arg === "--dwells")
      options.dwellsMs = list(value(index++), "--dwells", (item) =>
        item === "" ? "" : Number(item) * 1000,
      );
    else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else if (!options.out) options.out = arg;
    else throw new Error(`unexpected argument ${arg}`);
  }
  if (!Number.isInteger(options.runs) || options.runs < 1)
    throw new Error("--runs must be a positive integer");
  if (!Number.isInteger(options.warmup) || options.warmup < 0)
    throw new Error("--warmup must be a non-negative integer");
  if (!options.widths.every((width) => Number.isInteger(width) && width > 0))
    throw new Error("--widths must be positive integers");
  if (!options.themes.every((theme) => ["light", "dark"].includes(theme)))
    throw new Error("--themes accepts light and dark");
  if (!options.browserModes.every((mode) => BROWSER_MODES.includes(mode)))
    throw new Error("--browser-modes accepts playwright and browser-defaults");
  if (!options.inputs.every((input) => INPUTS.includes(input)))
    throw new Error("--inputs accepts mouse and touch");
  if (!options.dwellsMs.every((dwell) => Number.isFinite(dwell) && dwell >= 0))
    throw new Error("--dwells must be non-negative seconds");
  if (!(Number.isFinite(options.pressGapMs) && options.pressGapMs >= 0))
    throw new Error("--press-gap must be a non-negative number of ms");
  if (
    options.idleMs !== null &&
    !(Number.isFinite(options.idleMs) && options.idleMs >= 0)
  )
    throw new Error("--idle-ms must be a non-negative number of ms");
  if (!(options.cpuThrottle >= 1))
    throw new Error("--cpu-throttle must be >= 1");
  if (!(options.timeout >= 1000)) throw new Error("--timeout must be >= 1000");
  const base = new URL(options.base);
  // Local owner sessions only. Production needs Access and holds real data.
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) &&
    !base.hostname.endsWith(".localhost")
  )
    throw new Error("--base must be a loopback origin");
  options.base = base.origin;
  return options;
}

/**
 * Launch options that restore Chromium's own defaults for the two features
 * Playwright disables and that move first paint and history: PaintHolding and
 * the back-forward cache. Every other Playwright default stays.
 */
export function browserDefaultsLaunch(defaultFlags) {
  const disable = defaultFlags.find((flag) =>
    flag.startsWith("--disable-features="),
  );
  if (!disable || !disable.split("=")[1].split(",").includes("PaintHolding"))
    throw new Error(
      "Playwright's default flags no longer disable PaintHolding",
    );
  const features = disable
    .slice("--disable-features=".length)
    .split(",")
    .filter((feature) => feature !== "PaintHolding");
  return {
    ignoreDefaultArgs: [
      ...defaultFlags.filter((flag) => flag === "--disable-back-forward-cache"),
      disable,
    ],
    args: features.length ? [`--disable-features=${features.join(",")}`] : [],
  };
}

const sleep = (ms) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

/** Presses a locator the way the configured input would, with a real gap. */
async function press(page, session, locator, ctx) {
  await locator.waitFor({ state: "visible", timeout: ctx.timeout });
  if (ctx.input === "touch") {
    if (!ctx.pressGapMs) return locator.tap({ timeout: ctx.timeout });
    await locator.scrollIntoViewIfNeeded({ timeout: ctx.timeout });
    const box = await locator.boundingBox();
    if (!box) throw new Error("press target has no box");
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await session.cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    });
    await sleep(ctx.pressGapMs);
    await session.cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    return undefined;
  }
  return locator.click({ delay: ctx.pressGapMs, timeout: ctx.timeout });
}

const navLink = (workspace, label, expect) => ({
  label,
  async target(page, session, ctx) {
    const link = page
      .locator(
        `nav[aria-label="${workspace}"], dialog[aria-label="Navigation"]`,
      )
      .getByRole("link", { name: label, exact: true })
      .filter({ visible: true })
      .first();
    // Narrow layouts keep the workspace navigation in a drawer.
    if (!(await link.isVisible())) {
      const open = page.getByRole("button", { name: "Open navigation" });
      if (ctx.input === "touch") await open.tap({ timeout: ctx.timeout });
      else await open.click({ timeout: ctx.timeout });
      await link.waitFor({ state: "visible" });
    }
    return link;
  },
  expect,
});

const recordLinks = (page) =>
  page.locator(`#${REGION_ID} a[href^="/content/"]`).filter({ visible: true });

const firstRecordLink = async (page) => {
  const links = recordLinks(page);
  const index = await links.evaluateAll(
    (elements, source) =>
      elements.findIndex((element) =>
        new RegExp(source).test(new URL(element.href).pathname),
      ),
    RECORD_PATH.source,
  );
  if (index < 0) throw new Error("no record link in the content library");
  return links.nth(index);
};

/** Centers of record links fully inside the viewport, top to bottom. */
async function recordPoints(page, { inset = 0 } = {}) {
  return page.evaluate(
    ({ regionId, source, inset: margin }) =>
      [...document.querySelectorAll(`#${regionId} a[href^="/content/"]`)]
        .filter((element) =>
          new RegExp(source).test(new URL(element.href).pathname),
        )
        .map((element) => element.getBoundingClientRect())
        .filter(
          (rect) =>
            rect.width > 0 &&
            rect.top >= margin &&
            rect.bottom <= innerHeight - margin,
        )
        .map((rect) => ({
          x: rect.left + Math.min(rect.width / 2, 40),
          y: rect.top + rect.height / 2,
          left: rect.left,
          width: rect.width,
        })),
    { regionId: REGION_ID, source: RECORD_PATH.source, inset },
  );
}

const INTENTS = {
  /** Hover every Content nav item and visible record row for 10 s, no press. */
  async hover(page) {
    const nav = await page
      .locator('nav[aria-label="Content"] a')
      .filter({ visible: true })
      .all();
    const rows = await recordLinks(page).all();
    const targets = [...nav, ...rows];
    if (!targets.length) throw new Error("nothing to hover");
    const each = 10000 / targets.length;
    for (const target of targets) {
      await target.hover({ timeout: 5000 });
      await sleep(each);
    }
    await page.mouse.move(1, 1);
    return { gestures: targets.length };
  },
  /** Press a row, move off it, release: no click. */
  async pressCancel(page, _session, ctx) {
    const [point] = await recordPoints(page, { inset: 40 });
    if (!point) throw new Error("no record row in view");
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await sleep(ctx.pressGapMs);
    await page.mouse.move(point.x, Math.max(1, point.y - 300), { steps: 6 });
    await page.mouse.up();
    return { gestures: 1, waitMs: 10000 };
  },
  /** 100 touch scroll gestures that begin on record rows. */
  async touchScroll(page, session) {
    let gestures = 0;
    for (let index = 0; index < 100; index++) {
      const points = await recordPoints(page, { inset: 160 });
      const point = points[0] ?? { x: 180, y: 420 };
      await session.cdp.send("Input.synthesizeScrollGesture", {
        x: Math.round(point.x),
        y: Math.round(point.y),
        yDistance: index % 2 ? 120 : -120,
        gestureSourceType: "touch",
        speed: 1600,
      });
      gestures++;
    }
    return { gestures };
  },
  /** 50 drag-selects that start on a row title and pass the 10 px slop. */
  async dragSelect(page) {
    let gestures = 0;
    for (let index = 0; index < 50; index++) {
      const points = await recordPoints(page, { inset: 40 });
      const point = points[index % Math.max(1, points.length)];
      if (!point) throw new Error("no record row in view");
      const x = point.left + 2;
      await page.mouse.move(x, point.y);
      await page.mouse.down();
      await page.mouse.move(x + 40, point.y + 2, { steps: 8 });
      await page.mouse.up();
      gestures++;
    }
    await page.mouse.move(1, 1);
    return { gestures };
  },
  /** 50 secondary-button presses on record rows. */
  async rightClick(page, _session, ctx) {
    let gestures = 0;
    for (let index = 0; index < 50; index++) {
      const points = await recordPoints(page, { inset: 40 });
      const point = points[index % Math.max(1, points.length)];
      if (!point) throw new Error("no record row in view");
      await page.mouse.click(point.x, point.y, {
        button: "right",
        delay: ctx.pressGapMs,
      });
      await page.keyboard.press("Escape");
      gestures++;
    }
    return { gestures };
  },
};

export const CELLS = [
  {
    id: "load:content",
    kind: "load",
    label: "Content overview",
    path: "/content",
  },
  {
    id: "load:writing",
    kind: "load",
    label: "Writing library",
    path: "/content?group=writing",
  },
  {
    id: "load:newsletter",
    kind: "load",
    label: "Newsletter library",
    path: "/newsletter",
  },
  {
    id: "load:record",
    kind: "load",
    label: "First library record",
    path: null,
  },
  {
    id: "load:operations",
    kind: "load",
    label: "Operations machines",
    path: "/operations/observability?view=machines",
  },
  { id: "load:life", kind: "load", label: "Life overview", path: "/life" },
  {
    id: "load:life-health",
    kind: "load",
    label: "Life health (D1)",
    path: "/life/health",
  },
  {
    id: "switch:content-nav",
    kind: "switch",
    label: "Content navigation",
    start: "/content",
    steps: [
      navLink("Content", "Writing", (url) => group(url, "/content", "writing")),
      navLink("Content", "Pages", (url) => group(url, "/content", "website")),
      navLink("Content", "Projects", (url) => group(url, "/content", "work")),
      navLink("Content", "Newsletter", (url) => url.pathname === "/newsletter"),
    ],
  },
  {
    id: "switch:record",
    kind: "switch",
    label: "Library record round trip",
    start: "/content",
    steps: [
      {
        label: "Library to record",
        target: firstRecordLink,
        expect: (url) => RECORD_PATH.test(url.pathname),
      },
      {
        label: "Record to library",
        target: async (page) =>
          page
            .locator('nav[aria-label="Breadcrumb"] a')
            .filter({ visible: true })
            .first(),
        expect: (url) => url.pathname === "/content",
      },
    ],
  },
  {
    id: "switch:operations",
    kind: "switch",
    label: "Operations views",
    start: "/operations/observability?view=machines",
    steps: [
      navLink(
        "Operations",
        "Loops",
        (url) => url.searchParams.get("view") === "loops",
      ),
    ],
  },
  {
    id: "switch:life",
    kind: "switch",
    label: "Life sections",
    start: "/life",
    steps: [
      navLink("Life", "People", (url) => url.pathname === "/life/people"),
      navLink("Life", "Timeline", (url) => url.pathname === "/life/timeline"),
    ],
  },
  {
    id: "idle:content",
    kind: "idle",
    label: "Content idle, visible, no input",
    path: "/content",
    durationMs: 120000,
    widths: [1280],
    optIn: true,
  },
  {
    id: "idle:operations",
    kind: "idle",
    label: "Operations idle, visible, no input",
    path: "/operations/observability?view=machines",
    durationMs: 125000,
    widths: [1280],
    optIn: true,
  },
  {
    id: "intent:hover",
    kind: "intent",
    label: "Hover nav items and rows for 10 s",
    path: "/content",
    gesture: INTENTS.hover,
    widths: [1280],
    optIn: true,
  },
  {
    id: "intent:press-cancel",
    kind: "intent",
    label: "Press a row, move off, release",
    path: "/content",
    gesture: INTENTS.pressCancel,
    widths: [1280],
    optIn: true,
  },
  {
    id: "intent:touch-scroll",
    kind: "intent",
    label: "100 touch scrolls starting on rows",
    path: "/content",
    gesture: INTENTS.touchScroll,
    widths: [390],
    input: "touch",
    optIn: true,
  },
  {
    id: "intent:drag-select",
    kind: "intent",
    label: "50 drag-selects starting on row titles",
    path: "/content",
    gesture: INTENTS.dragSelect,
    widths: [1280],
    optIn: true,
  },
  {
    id: "intent:right-click",
    kind: "intent",
    label: "50 secondary presses on rows",
    path: "/content",
    gesture: INTENTS.rightClick,
    widths: [1280],
    optIn: true,
  },
  {
    id: "warm:content",
    kind: "warm",
    label: "Second Content document in one context",
    start: "/content",
    step: navLink("Content", "Writing", (url) =>
      group(url, "/content", "writing"),
    ),
    widths: [1280],
    optIn: true,
  },
  {
    id: "back:content",
    kind: "back",
    label: "Back from Writing to the Content overview",
    start: "/content",
    step: navLink("Content", "Writing", (url) =>
      group(url, "/content", "writing"),
    ),
    widths: [1280],
    optIn: true,
  },
];

function group(url, pathname, value) {
  return url.pathname === pathname && url.searchParams.get("group") === value;
}

/**
 * Counts announcements (design 4.5). `mutated` is called for each live region
 * a mutation touched, with its current text; `flush` runs once per animation
 * frame. A frame whose mutations end with non-empty text counts once when the
 * text changed or was cleared inside that frame. Self-contained: the harness
 * serializes it into the page.
 */
export function createAnnouncementCounter() {
  const last = new Map();
  const pending = new Map();
  const events = [];
  return {
    /** Text present before the document finished parsing is not announced. */
    baseline(region, text) {
      last.set(region, text);
      pending.delete(region);
    },
    mutated(region, text, meta) {
      let entry = pending.get(region);
      if (!entry) {
        entry = {
          startText: last.get(region) ?? "",
          cleared: false,
          astryx: Boolean(meta && meta.astryx),
          alert: Boolean(meta && meta.alert),
        };
        pending.set(region, entry);
      }
      if (text === "") entry.cleared = true;
    },
    flush(t, textOf) {
      for (const [region, entry] of pending) {
        const text = textOf(region);
        if (text && (text !== entry.startText || entry.cleared))
          events.push({ t, astryx: entry.astryx, alert: entry.alert });
        last.set(region, text);
      }
      pending.clear();
    },
    count(since) {
      const recent = events.filter((event) => event.t >= since);
      return {
        total: recent.length,
        astryx: recent.filter((event) => event.astryx).length,
        alert: recent.filter((event) => event.alert).length,
      };
    },
  };
}

/** Runs in every document before its own scripts. Serialized by the harness. */
function installPerfProbe(
  { regionId, loadingSelector, clickKey },
  makeAnnouncementCounter,
) {
  if (window.__adminPerfProbe) return;
  const now = () => performance.now();
  try {
    performance.setResourceTimingBufferSize(4000);
  } catch {
    /* Older engines keep the default buffer. */
  }
  const state = {
    fcp: null,
    lcp: null,
    shifts: [],
    longTasks: [],
    lastMutation: 0,
    armedAt: 0,
    clickAt: null,
    pointerdownAt: null,
    firstRegionMutation: null,
    regionPaint: null,
    dclAt: null,
    islands: 0,
    hydratedAt: null,
    interactiveAt: null,
    interactiveSource: null,
    loading: [],
    loadingOpen: null,
    pageshows: [],
  };
  const loadingElements = new Set();
  const committedRoots = new WeakMap();
  const announcements = makeAnnouncementCounter();
  let hookInjected = false;

  const emit = (payload) => {
    try {
      window
        .__adminPerfEmit?.({ ...payload, origin: performance.timeOrigin })
        ?.catch?.(() => undefined);
    } catch {
      /* The document is unloading. */
    }
  };
  const observe = (type, callback, options = {}) => {
    try {
      new PerformanceObserver((list) =>
        list.getEntries().forEach(callback),
      ).observe({ type, buffered: true, ...options });
    } catch {
      /* Unsupported entry type. */
    }
  };
  observe("paint", (entry) => {
    if (entry.name === "first-contentful-paint") state.fcp = entry.startTime;
  });
  observe("largest-contentful-paint", (entry) => {
    state.lcp = entry.startTime;
  });
  observe("layout-shift", (entry) =>
    state.shifts.push({
      t: entry.startTime,
      value: entry.value,
      input: entry.hadRecentInput,
    }),
  );
  observe("longtask", (entry) =>
    state.longTasks.push({ t: entry.startTime, duration: entry.duration }),
  );
  observe(
    "event",
    (entry) => {
      if (!entry.interactionId) return;
      emit({
        kind: "event",
        t: entry.startTime,
        duration: entry.duration,
        processingStart: entry.processingStart,
        processingEnd: entry.processingEnd,
      });
    },
    { durationThreshold: 16 },
  );
  addEventListener("pageshow", (event) =>
    state.pageshows.push({ t: event.timeStamp, persisted: event.persisted }),
  );

  const loadIslands = () => [
    ...document.querySelectorAll('astro-island[client="load"]'),
  ];
  const checkHydration = (t) => {
    if (state.dclAt === null) return;
    const islands = loadIslands();
    state.islands = islands.length;
    if (
      state.hydratedAt === null &&
      islands.every((island) => !island.hasAttribute("ssr"))
    )
      state.hydratedAt = t;
    if (state.interactiveAt !== null || state.hydratedAt === null) return;
    if (!islands.length) {
      state.interactiveAt = state.hydratedAt;
      state.interactiveSource = "no-islands";
    } else if (
      hookInjected &&
      islands.every((island) => committedRoots.has(island))
    ) {
      state.interactiveAt = Math.max(
        state.hydratedAt,
        ...islands.map((island) => committedRoots.get(island)),
      );
      state.interactiveSource = "react-commit";
    }
  };
  // React calls this hook in production builds too. It only observes commits.
  if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      isDisabled: false,
      renderers: new Map(),
      inject(renderer) {
        hookInjected = true;
        const id = this.renderers.size + 1;
        this.renderers.set(id, renderer);
        return id;
      },
      onCommitFiberRoot(_id, root) {
        const t = now();
        const container = root?.containerInfo;
        if (
          container &&
          !committedRoots.has(container) &&
          !root.current?.memoizedState?.isDehydrated
        ) {
          committedRoots.set(container, t);
          checkHydration(t);
        }
      },
      onCommitFiberUnmount() {},
      onPostCommitFiberRoot() {},
      checkDCE() {},
    };
  }
  document.addEventListener("DOMContentLoaded", () => {
    state.dclAt = now();
    baselineLiveRegions();
    checkHydration(state.dclAt);
  });

  const inRegion = (node) => {
    const region = document.getElementById(regionId);
    return Boolean(region && (region === node || region.contains(node)));
  };
  const trackLoading = (t, records) => {
    for (const element of loadingElements)
      if (!element.isConnected || !element.matches(loadingSelector))
        loadingElements.delete(element);
    for (const record of records) {
      if (record.type === "attributes") {
        if (record.target.matches?.(loadingSelector))
          loadingElements.add(record.target);
        continue;
      }
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches(loadingSelector)) loadingElements.add(node);
        for (const element of node.querySelectorAll(loadingSelector))
          loadingElements.add(element);
      }
    }
    const count = loadingElements.size;
    // The committed baseline's definition, kept alongside the new one.
    const statusAncestors = new Set(
      [...loadingElements]
        .map((element) => element.closest('[role="status"]'))
        .filter(Boolean),
    ).size;
    if (count && !state.loadingOpen) {
      state.loadingOpen = {
        start: t,
        end: null,
        max: count,
        announcements: statusAncestors,
      };
      state.loading.push(state.loadingOpen);
    } else if (count) {
      state.loadingOpen.max = Math.max(state.loadingOpen.max, count);
      state.loadingOpen.announcements = Math.max(
        state.loadingOpen.announcements,
        statusAncestors,
      );
    } else if (state.loadingOpen) {
      state.loadingOpen.end = t;
      state.loadingOpen = null;
    }
  };

  const LIVE =
    '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]';
  const liveText = (region) =>
    region.isConnected && !region.closest('[aria-hidden="true"]')
      ? (region.textContent ?? "").replace(/\s+/g, " ").trim()
      : "";
  function baselineLiveRegions() {
    for (const region of document.querySelectorAll(LIVE))
      announcements.baseline(region, liveText(region));
  }
  let flushQueued = false;
  const trackAnnouncements = (records) => {
    // Parser-inserted regions carry page-load text, which is not an
    // announcement; DOMContentLoaded records it as each region's start.
    if (state.dclAt === null) return;
    const touched = new Set();
    for (const record of records) {
      if (record.type === "attributes") continue;
      const target =
        record.target.nodeType === 1
          ? record.target
          : record.target.parentElement;
      const region = target?.closest?.(LIVE);
      if (region) touched.add(region);
      for (const node of record.addedNodes ?? []) {
        if (node.nodeType !== 1) continue;
        if (node.matches(LIVE)) touched.add(node);
        if (node.firstElementChild)
          for (const element of node.querySelectorAll(LIVE))
            touched.add(element);
      }
    }
    if (!touched.size) return;
    for (const region of touched)
      announcements.mutated(region, liveText(region), {
        astryx: region.hasAttribute("data-astryx-live-region"),
        alert:
          region.getAttribute("role") === "alert" ||
          region.getAttribute("aria-live") === "assertive",
      });
    if (flushQueued) return;
    flushQueued = true;
    requestAnimationFrame(() => {
      flushQueued = false;
      announcements.flush(now(), liveText);
    });
  };

  new MutationObserver((records) => {
    const t = now();
    state.lastMutation = t;
    trackLoading(t, records);
    trackAnnouncements(records);
    if (
      state.firstRegionMutation === null &&
      t >= state.armedAt &&
      records.some((record) => inRegion(record.target))
    ) {
      state.firstRegionMutation = t;
      requestAnimationFrame(() => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          if (state.firstRegionMutation === t) state.regionPaint = now();
        };
        channel.port2.postMessage(null);
      });
    }
    if (records.some((record) => record.attributeName === "ssr"))
      checkHydration(t);
  }).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });

  const input = () => {
    try {
      return JSON.parse(sessionStorage.getItem(clickKey) ?? "{}");
    } catch {
      return {};
    }
  };
  const remember = (key, timeStamp) => {
    try {
      sessionStorage.setItem(
        clickKey,
        JSON.stringify({
          ...input(),
          [key]: performance.timeOrigin + timeStamp,
        }),
      );
    } catch {
      /* Storage blocked: the step reports no input time. */
    }
  };
  addEventListener(
    "pointerdown",
    (event) => {
      state.pointerdownAt = event.timeStamp;
      state.armedAt = event.timeStamp;
      state.firstRegionMutation = null;
      state.regionPaint = null;
      try {
        sessionStorage.removeItem(clickKey);
      } catch {
        /* See remember. */
      }
      remember("pointerdown", event.timeStamp);
    },
    { capture: true },
  );
  addEventListener(
    "click",
    (event) => {
      state.clickAt = event.timeStamp;
      remember("click", event.timeStamp);
    },
    { capture: true },
  );

  const reactPropsReady = (island) => {
    const element = island.firstElementChild;
    return Boolean(
      element &&
      Object.keys(element).some((key) => key.startsWith("__reactProps$")),
    );
  };

  window.__adminPerfProbe = {
    input,
    pageshows: () => state.pageshows.slice(),
    notRestoredReasons() {
      const navigation = performance.getEntriesByType("navigation")[0];
      const collect = (node, out = []) => {
        if (!node) return out;
        for (const item of node.reasons ?? [])
          if (/^[A-Za-z0-9:_-]{1,80}$/.test(item?.reason ?? ""))
            out.push(item.reason);
        for (const child of node.children ?? []) collect(child, out);
        return out;
      };
      return {
        type: navigation?.type ?? null,
        reasons: navigation?.notRestoredReasons
          ? collect(navigation.notRestoredReasons)
          : null,
      };
    },
    settled(quietMs) {
      if (document.readyState !== "complete") return false;
      if (state.interactiveAt === null) checkHydration(now());
      // Fallback when React never injected into the hook: frame resolution.
      if (
        state.interactiveAt === null &&
        state.hydratedAt !== null &&
        !hookInjected &&
        loadIslands().every(reactPropsReady)
      ) {
        state.interactiveAt = now();
        state.interactiveSource = "react-props";
      }
      if (state.islands > 0 && state.interactiveAt === null) return false;
      const last = Math.max(
        state.lastMutation,
        state.clickAt ?? 0,
        state.interactiveAt ?? 0,
      );
      return now() - last >= quietMs;
    },
    summary(sinceEpoch) {
      const origin = performance.timeOrigin;
      const since = Math.max(0, sinceEpoch - origin);
      const end = now();
      const navigation = performance.getEntriesByType("navigation")[0];
      const timing = (entries) =>
        Object.fromEntries(
          (entries ?? [])
            .filter((entry) => /^[a-z0-9]{1,16}$/.test(entry.name))
            .map((entry) => [
              entry.name,
              /^\d+(\.\d+)?$/.test(entry.description)
                ? Number(entry.description)
                : entry.duration,
            ]),
        );
      const resources = performance
        .getEntriesByType("resource")
        .filter((entry) => entry.startTime >= since);
      const bytes = {
        jsTransfer: 0,
        jsDecoded: 0,
        cssTransfer: 0,
        cssDecoded: 0,
        totalTransfer: 0,
        cached: 0,
        revalidated: 0,
        astroResources: 0,
        astroFromCache: 0,
      };
      const api = [];
      let lastResourceEnd = 0;
      for (const entry of resources) {
        const url = new URL(entry.name, location.href);
        lastResourceEnd = Math.max(lastResourceEnd, entry.responseEnd);
        bytes.totalTransfer += entry.transferSize;
        const fromCache = entry.transferSize === 0 && entry.decodedBodySize > 0;
        if (fromCache) bytes.cached++;
        else if (
          entry.transferSize > 0 &&
          entry.transferSize < entry.encodedBodySize
        )
          bytes.revalidated++;
        if (
          url.origin === location.origin &&
          url.pathname.startsWith("/_astro/")
        ) {
          bytes.astroResources++;
          if (fromCache) bytes.astroFromCache++;
        }
        if (/\.m?js$/.test(url.pathname)) {
          bytes.jsTransfer += entry.transferSize;
          bytes.jsDecoded += entry.decodedBodySize;
        } else if (/\.css$/.test(url.pathname)) {
          bytes.cssTransfer += entry.transferSize;
          bytes.cssDecoded += entry.decodedBodySize;
        }
        if (url.origin === location.origin && url.pathname.startsWith("/api/"))
          api.push({
            path: url.pathname,
            status: entry.responseStatus,
            durationMs: entry.duration,
            serverTiming: timing(entry.serverTiming),
          });
      }
      let cls = 0;
      let windowValue = 0;
      let windowStart = -Infinity;
      let previous = -Infinity;
      const shifts = state.shifts.filter((shift) => shift.t >= since);
      for (const shift of shifts.filter((item) => !item.input)) {
        if (shift.t - previous > 1000 || shift.t - windowStart > 5000) {
          windowValue = 0;
          windowStart = shift.t;
        }
        windowValue += shift.value;
        previous = shift.t;
        cls = Math.max(cls, windowValue);
      }
      const longTasks = state.longTasks.filter((task) => task.t >= since);
      const loading = state.loading.filter(
        (interval) => (interval.end ?? end) >= since,
      );
      return {
        origin,
        since,
        now: end,
        theme: document.documentElement.dataset.theme ?? null,
        visibility: document.visibilityState,
        navigation:
          navigation && since === 0
            ? {
                status: navigation.responseStatus,
                requestStart: navigation.requestStart,
                responseStart: navigation.responseStart,
                responseEnd: navigation.responseEnd,
                domInteractive: navigation.domInteractive,
                dcl: navigation.domContentLoadedEventEnd,
                load: navigation.loadEventEnd,
                transferSize: navigation.transferSize,
                decodedBodySize: navigation.decodedBodySize,
                serverTiming: timing(navigation.serverTiming),
              }
            : null,
        fcp: state.fcp,
        lcp: state.lcp,
        cls,
        layoutShiftTotal: shifts.reduce((sum, shift) => sum + shift.value, 0),
        longTasks: {
          count: longTasks.length,
          totalMs: longTasks.reduce((sum, task) => sum + task.duration, 0),
          blockingMs: longTasks.reduce(
            (sum, task) => sum + Math.max(0, task.duration - 50),
            0,
          ),
        },
        bytes,
        resourceCount: resources.length,
        api,
        lastResourceEnd,
        lastMutation: state.lastMutation,
        regionPaint: state.regionPaint,
        pointerdownAt: state.pointerdownAt,
        clickAt: state.clickAt,
        hydration: {
          islands: state.islands,
          hydratedAt: state.hydratedAt,
          interactiveAt: state.interactiveAt,
          source: state.interactiveSource,
        },
        loading: {
          intervals: loading.length,
          firstAt: loading.length ? Math.max(loading[0].start, since) : null,
          visibleMs: loading.reduce(
            (sum, interval) =>
              sum + (interval.end ?? end) - Math.max(interval.start, since),
            0,
          ),
          maxCount: loading.reduce(
            (max, interval) => Math.max(max, interval.max),
            0,
          ),
          maxAnnouncements: loading.reduce(
            (max, interval) => Math.max(max, interval.announcements),
            0,
          ),
          stillVisible: loading.some((interval) => interval.end === null),
        },
        announcements: announcements.count(since),
        liveRegions: {
          astryxPolite: document.querySelectorAll(
            '[data-astryx-live-region="polite"]',
          ).length,
          astryxAssertive: document.querySelectorAll(
            '[data-astryx-live-region="assertive"]',
          ).length,
          status: document.querySelectorAll('[role="status"]').length,
        },
      };
    },
  };
}

function sanitizePath(pathname) {
  return pathname
    .replace(/^\/content\/([A-Za-z]+)\/[^/]+$/, "/content/$1/:id")
    .replace(/^\/newsletter\/[^/]+$/, "/newsletter/:slug")
    .replace(/^\/_astro\/.+$/, "/_astro/:asset");
}

/** Path plus the group and view navigation preferences, never other queries. */
function routeLabel(url) {
  const params = new URLSearchParams();
  for (const key of ["group", "view"])
    if (/^[a-z-]{1,40}$/.test(url.searchParams.get(key) ?? ""))
      params.set(key, url.searchParams.get(key));
  return sanitizePath(url.pathname) + (params.size ? `?${params}` : "");
}

function sanitizeMessage(error) {
  return String(error?.message ?? error)
    .split("\n")[0]
    .replace(/https?:\/\/[^\s"'`)]+/g, (href) => {
      try {
        return new URL(href).origin + sanitizePath(new URL(href).pathname);
      } catch {
        return "<url>";
      }
    })
    .replace(/\/content\/([A-Za-z]+)\/[^\s"'`)?/]+/g, "/content/$1/:id")
    .replace(/\?[^\s"'`)]*/g, "")
    .slice(0, 240);
}

const round = (value, digits = 1) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 10 ** digits) / 10 ** digits
    : null;

/**
 * Request-layer bookkeeping for one page. Documents are counted from
 * main-frame navigation requests. A non-2xx response to a non-navigation
 * request leaves the in-flight set when its headers arrive: the page may never
 * read that body, and waiting for Chromium to abort it measured the abort.
 */
export function trackRequests(page) {
  const inflight = new Set();
  const openBodies = new Set();
  const waiters = new Set();
  const entries = new Map();
  const tracker = {
    total: 0,
    byType: {},
    documents: 0,
    apiStatus: {},
    pendingDocument: false,
    lastActivity: performance.now(),
    records: [],
    reset() {
      tracker.total = 0;
      tracker.byType = {};
      tracker.documents = 0;
      tracker.apiStatus = {};
      tracker.records = [];
    },
    get inflight() {
      return inflight.size;
    },
    get openBodies() {
      return openBodies.size;
    },
    quietFor(quietMs) {
      return (
        inflight.size === 0 &&
        performance.now() - tracker.lastActivity >= quietMs
      );
    },
    /** Resolves once the pending document commits, fails, or the deadline passes. */
    documentSettled(deadline) {
      if (!tracker.pendingDocument) return Promise.resolve();
      return new Promise((resolvePromise, reject) => {
        const timer = setTimeout(
          () => {
            waiters.delete(done);
            reject(new Error("document navigation did not commit"));
          },
          Math.max(0, deadline - Date.now()),
        );
        const done = () => {
          clearTimeout(timer);
          resolvePromise();
        };
        waiters.add(done);
      });
    },
    whenQuiet(quietMs, deadline) {
      return new Promise((resolvePromise, reject) => {
        const check = () => {
          if (tracker.quietFor(quietMs)) return resolvePromise();
          if (Date.now() > deadline)
            return reject(new Error("network did not go idle"));
          const idle = performance.now() - tracker.lastActivity;
          setTimeout(check, Math.max(10, quietMs - idle));
        };
        check();
      });
    },
  };
  const settleDocument = () => {
    tracker.pendingDocument = false;
    for (const waiter of waiters) waiter();
    waiters.clear();
  };
  const isDocument = (request) =>
    request.isNavigationRequest() && request.frame() === page.mainFrame();
  page.on("request", (request) => {
    inflight.add(request);
    tracker.total++;
    const type = request.resourceType();
    tracker.byType[type] = (tracker.byType[type] ?? 0) + 1;
    const document = isDocument(request);
    if (document) {
      tracker.documents++;
      tracker.pendingDocument = true;
    }
    const entry = {
      method: request.method(),
      url: request.url(),
      resourceType: type,
      pathClass: document
        ? "document"
        : classifyRequest({ method: request.method(), url: request.url() })
            .pathClass,
      status: null,
      startedAt: performance.now(),
      responseAt: null,
      endAt: null,
      failed: false,
    };
    entries.set(request, entry);
    tracker.records.push(entry);
    tracker.lastActivity = performance.now();
  });
  const finished = (request) => {
    inflight.delete(request);
    openBodies.delete(request);
    const entry = entries.get(request);
    if (entry) {
      entry.endAt = performance.now();
      entry.failed = Boolean(request.failure());
      entries.delete(request);
    }
    tracker.lastActivity = performance.now();
    if (isDocument(request) && request.failure()) settleDocument();
  };
  page.on("response", (response) => {
    const url = new URL(response.url());
    const request = response.request?.();
    const status = response.status();
    const entry = request ? entries.get(request) : null;
    if (entry) {
      entry.status = status;
      entry.responseAt = performance.now();
    }
    if (
      url.origin === new URL(page.url()).origin &&
      url.pathname.startsWith("/api/")
    )
      tracker.apiStatus[sanitizePath(url.pathname)] = status;
    if (
      request &&
      status >= 400 &&
      !request.isNavigationRequest() &&
      inflight.has(request)
    ) {
      inflight.delete(request);
      openBodies.add(request);
      tracker.lastActivity = performance.now();
    }
  });
  page.on("requestfinished", finished);
  page.on("requestfailed", finished);
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) settleDocument();
  });
  return tracker;
}

/** Record reads and other requests an intent gesture caused. */
export function intentSummary(records, { gestureEndAt, windowMs }) {
  const reads = records.filter((record) => record.pathClass === "record-read");
  const windowEnd = gestureEndAt + windowMs;
  return {
    recordReadsStarted: reads.length,
    recordReadsCancelledWithinWindow: reads.filter(
      (read) =>
        read.failed &&
        read.endAt !== null &&
        read.endAt - read.startedAt <= windowMs,
    ).length,
    recordReadsAbortedBeforeResponse: reads.filter(
      (read) => read.failed && read.responseAt === null,
    ).length,
    recordReadsCompleted: reads.filter(
      (read) => !read.failed && read.endAt !== null,
    ).length,
    recordReadsActiveAfterWindow: reads.filter(
      (read) =>
        read.startedAt > windowEnd || (read.endAt ?? Infinity) > windowEnd,
    ).length,
    scripts: records.filter((record) => record.resourceType === "script")
      .length,
    documents: records.filter((record) => record.pathClass === "document")
      .length,
    requests: records.length,
  };
}

/**
 * Matches proxy entries to page requests by method and URL. Speculative
 * requests (Sec-Purpose) are reported, not failed; any other upstream request
 * no page request explains is `unexplained`. Refused requests to other origins
 * are Chromium's own background traffic and are reported as `external`.
 */
export function crossCheckProxy(pageRequests, snapshot) {
  const remaining = new Map();
  for (const request of pageRequests) {
    const key = `${request.method} ${request.url}`;
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  let matched = 0;
  let speculative = 0;
  let unexplained = 0;
  const speculativeByClass = {};
  const unexplainedByClass = {};
  for (const entry of snapshot.entries) {
    if (entry.purpose !== "none") {
      speculative++;
      speculativeByClass[entry.pathClass] =
        (speculativeByClass[entry.pathClass] ?? 0) + 1;
      continue;
    }
    const key = `${entry.method} ${entry.url}`;
    if (remaining.get(key)) {
      remaining.set(key, remaining.get(key) - 1);
      matched++;
    } else {
      unexplained++;
      unexplainedByClass[entry.pathClass] =
        (unexplainedByClass[entry.pathClass] ?? 0) + 1;
    }
  }
  return {
    proxyTotal: snapshot.total,
    pageTotal: pageRequests.length,
    matched,
    notAtProxy: pageRequests.length - matched,
    speculative,
    speculativeByClass,
    unexplained,
    unexplainedByClass,
    // Browser-process traffic to other origins (Chromium's own services),
    // refused by the proxy and never seen by the page.
    external: snapshot.refused ?? 0,
    proxyDocuments: snapshot.entries.filter(
      (entry) => entry.pathClass === "document" && entry.purpose === "none",
    ).length,
  };
}

async function settle(page, tracker, timeout) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("page did not settle before timeout");
    if (tracker.pendingDocument) {
      await tracker.documentSettled(deadline);
      continue;
    }
    try {
      await page.waitForFunction(
        (quietMs) => window.__adminPerfProbe?.settled(quietMs) === true,
        QUIET_MS,
        { polling: "raf", timeout: remaining },
      );
    } catch (error) {
      if (/context was destroyed|navigat/i.test(String(error?.message)))
        continue;
      throw error;
    }
    if (tracker.pendingDocument) continue;
    if (!tracker.quietFor(QUIET_MS)) {
      await tracker.whenQuiet(QUIET_MS, deadline);
      continue;
    }
    return;
  }
}

async function cdpMetrics(cdp) {
  try {
    const { metrics } = await cdp.send("Performance.getMetrics");
    const values = Object.fromEntries(
      metrics.map(({ name, value }) => [name, value]),
    );
    return {
      taskMs: values.TaskDuration * 1000,
      scriptMs: values.ScriptDuration * 1000,
      layoutMs: values.LayoutDuration * 1000,
      recalcStyleMs: values.RecalcStyleDuration * 1000,
      heapUsedBytes: values.JSHeapUsedSize,
    };
  } catch {
    return null;
  }
}

function cdpDelta(before, after) {
  if (!after) return null;
  // A cross-process navigation restarts the renderer's counters.
  const reset = !before || after.taskMs < before.taskMs;
  const delta = (key) => round(reset ? after[key] : after[key] - before[key]);
  return {
    taskMs: delta("taskMs"),
    scriptMs: delta("scriptMs"),
    layoutMs: delta("layoutMs"),
    recalcStyleMs: delta("recalcStyleMs"),
    heapUsedBytes: after.heapUsedBytes,
    heapUsedDeltaBytes: reset
      ? null
      : after.heapUsedBytes - before.heapUsedBytes,
    counterReset: reset,
  };
}

async function openSession(browser, ctx) {
  const touch = ctx.input === "touch";
  const context = await browser.newContext({
    viewport: { width: ctx.width, height: HEIGHTS[ctx.width] ?? 900 },
    deviceScaleFactor: 1,
    colorScheme: ctx.theme,
    serviceWorkers: "block",
    hasTouch: touch,
    isMobile: touch,
  });
  await context.addCookies([
    { name: "ap-theme", value: ctx.theme, url: ctx.base },
  ]);
  const events = [];
  await context.exposeBinding("__adminPerfEmit", (_source, payload) => {
    if (payload && typeof payload === "object") events.push(payload);
  });
  await context.addInitScript(
    `(${installPerfProbe})(${JSON.stringify({
      regionId: REGION_ID,
      loadingSelector: LOADING_SELECTOR,
      clickKey: CLICK_KEY,
    })}, ${createAnnouncementCounter});`,
  );
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  if (ctx.cpuThrottle > 1)
    await cdp.send("Emulation.setCPUThrottlingRate", {
      rate: ctx.cpuThrottle,
    });
  const tracker = trackRequests(page);
  return { context, page, cdp, tracker, events };
}

async function assertTheme(page, theme) {
  const actual = await page.evaluate(
    () => document.documentElement.dataset.theme ?? null,
  );
  if (actual !== theme)
    throw new Error(`data-theme is ${actual ?? "unset"}, expected ${theme}`);
}

function serverTimingOf(summary, tracker) {
  const api = {};
  for (const entry of summary.api)
    api[sanitizePath(entry.path)] = {
      status: tracker.apiStatus[sanitizePath(entry.path)] ?? entry.status,
      durationMs: round(entry.durationMs),
      ...entry.serverTiming,
    };
  // A non-2xx body the page never read has no Resource Timing entry yet.
  for (const [path, status] of Object.entries(tracker.apiStatus))
    api[path] ??= { status };
  return {
    document: summary.navigation?.serverTiming ?? {},
    api,
  };
}

function loadingOf(summary, zero) {
  return {
    appeared: summary.loading.intervals > 0,
    firstMs:
      summary.loading.firstAt === null
        ? null
        : round(summary.origin + summary.loading.firstAt - zero),
    visibleMs: round(summary.loading.visibleMs),
    maxCount: summary.loading.maxCount,
    maxAnnouncements: summary.loading.maxAnnouncements,
    stillVisible: summary.loading.stillVisible,
  };
}

/** Proxy counts for the window since the last reset; throws on unexplained requests. */
function proxyCheck(ctx, tracker, label) {
  if (!ctx.proxy) return undefined;
  const origin = new URL(ctx.base).origin;
  const check = crossCheckProxy(
    tracker.records.filter((record) => {
      try {
        return new URL(record.url).origin === origin;
      } catch {
        return false;
      }
    }),
    ctx.proxy.snapshot(),
  );
  if (check.unexplained > 0)
    throw new Error(
      `${label}: ${check.unexplained} proxy requests no page request explains (${JSON.stringify(check.unexplainedByClass)})`,
    );
  if (check.proxyDocuments !== tracker.documents)
    throw new Error(
      `${label}: proxy saw ${check.proxyDocuments} documents, the page ${tracker.documents}`,
    );
  return check;
}

async function measureLoad(browser, ctx, path) {
  const session = await openSession(browser, ctx);
  const { page, tracker, cdp } = session;
  try {
    const before = await cdpMetrics(cdp);
    ctx.proxy?.reset();
    await page.goto(ctx.base + path, {
      waitUntil: "commit",
      timeout: ctx.timeout,
    });
    await settle(page, tracker, ctx.timeout);
    await assertTheme(page, ctx.theme);
    const summary = await page.evaluate(() =>
      window.__adminPerfProbe.summary(0),
    );
    const after = await cdpMetrics(cdp);
    const navigation = summary.navigation ?? {};
    return {
      status: navigation.status ?? null,
      ttfbMs: round(navigation.responseStart),
      requestStartMs: round(navigation.requestStart),
      responseEndMs: round(navigation.responseEnd),
      fcpMs: round(summary.fcp),
      lcpMs: round(summary.lcp),
      dclMs: round(navigation.dcl),
      loadMs: round(navigation.load),
      hydratedMs: round(summary.hydration.hydratedAt),
      interactiveMs: round(summary.hydration.interactiveAt),
      interactiveSource: summary.hydration.source,
      islands: summary.hydration.islands,
      settledMs: round(
        Math.max(
          summary.lastMutation,
          summary.lastResourceEnd,
          summary.hydration.interactiveAt ?? 0,
          navigation.load ?? 0,
        ),
      ),
      cls: round(summary.cls, 4),
      layoutShiftTotal: round(summary.layoutShiftTotal, 4),
      longTaskCount: summary.longTasks.count,
      longTaskMs: round(summary.longTasks.totalMs),
      blockingMs: round(summary.longTasks.blockingMs),
      documentTransferBytes: navigation.transferSize ?? null,
      documentDecodedBytes: navigation.decodedBodySize ?? null,
      jsTransferBytes: summary.bytes.jsTransfer,
      jsDecodedBytes: summary.bytes.jsDecoded,
      cssTransferBytes: summary.bytes.cssTransfer,
      cssDecodedBytes: summary.bytes.cssDecoded,
      totalTransferBytes:
        summary.bytes.totalTransfer + (navigation.transferSize ?? 0),
      cachedResources: summary.bytes.cached,
      revalidatedResources: summary.bytes.revalidated,
      requests: tracker.total,
      requestsByType: tracker.byType,
      openBodiesAtSettle: tracker.openBodies,
      serverTiming: serverTimingOf(summary, tracker),
      loading: loadingOf(summary, summary.origin),
      announcements: summary.announcements,
      liveRegions: summary.liveRegions,
      proxy: proxyCheck(ctx, tracker, "load"),
      cdp: cdpDelta(before, after),
    };
  } finally {
    await session.context.close();
  }
}

async function startAt(session, ctx, path) {
  ctx.proxy?.reset();
  await session.page.goto(ctx.base + path, {
    waitUntil: "commit",
    timeout: ctx.timeout,
  });
  await settle(session.page, session.tracker, ctx.timeout);
  await assertTheme(session.page, ctx.theme);
}

async function measureSwitch(browser, ctx, cell) {
  const session = await openSession(browser, ctx);
  const { page, tracker, cdp, events } = session;
  try {
    await startAt(session, ctx, cell.start);
    const steps = [];
    for (const step of cell.steps) {
      const target = await step.target(page, session, ctx);
      await target.waitFor({ state: "visible", timeout: ctx.timeout });
      const dwellStart = tracker.total;
      if (ctx.dwellMs) await sleep(ctx.dwellMs);
      const dwellRequests = tracker.total - dwellStart;
      const openBodiesAtPress = tracker.openBodies;
      const before = await cdpMetrics(cdp);
      tracker.reset();
      ctx.proxy?.reset();
      await press(page, session, target, ctx);
      await settle(page, tracker, ctx.timeout);
      if (!step.expect(new URL(page.url())))
        throw new Error(
          `${step.label} ended on ${sanitizePath(new URL(page.url()).pathname)}`,
        );
      await assertTheme(page, ctx.theme);
      const input = await page.evaluate(() => window.__adminPerfProbe.input());
      if (typeof input.click !== "number")
        throw new Error(`${step.label}: the click was not observed`);
      const summary = await page.evaluate(
        (since) => window.__adminPerfProbe.summary(since),
        input.click,
      );
      const after = await cdpMetrics(cdp);
      const zero = input.click;
      const at = (value) =>
        value === null || value === undefined
          ? null
          : round(summary.origin + value - zero);
      const newDocument = summary.origin > zero;
      const paint = at(summary.regionPaint);
      const fcp = newDocument ? at(summary.fcp) : null;
      const firstChangeMs = newDocument
        ? [fcp, paint].every((value) => value === null)
          ? null
          : Math.max(...[fcp, paint].filter((value) => value !== null))
        : paint;
      const startEpoch = input.pointerdown ?? zero;
      const interaction = events
        .filter((entry) => entry.origin + entry.t >= startEpoch - 1)
        .sort((a, b) => b.duration - a.duration)[0];
      steps.push({
        label: step.label,
        documentRequest: tracker.documents > 0,
        newDocument,
        dwellMs: ctx.dwellMs,
        dwellRequests,
        openBodiesAtPress,
        pointerdownToClickMs:
          typeof input.pointerdown === "number"
            ? round(zero - input.pointerdown)
            : null,
        firstChangeMs,
        settledMs: at(
          Math.max(
            summary.lastMutation,
            summary.lastResourceEnd,
            summary.hydration.interactiveAt ?? 0,
            summary.navigation?.load ?? 0,
            newDocument ? 0 : (summary.clickAt ?? 0),
          ),
        ),
        eventMs: interaction ? round(interaction.duration) : null,
        eventInputDelayMs: interaction
          ? round(interaction.processingStart - interaction.t)
          : null,
        eventProcessingMs: interaction
          ? round(interaction.processingEnd - interaction.processingStart)
          : null,
        eventPresentationMs: interaction
          ? round(
              interaction.t + interaction.duration - interaction.processingEnd,
            )
          : null,
        clsExcludingInput: round(summary.cls, 4),
        layoutShiftTotal: round(summary.layoutShiftTotal, 4),
        longTaskCount: summary.longTasks.count,
        longTaskMs: round(summary.longTasks.totalMs),
        requests: tracker.total,
        requestsByType: tracker.byType,
        jsTransferBytes: summary.bytes.jsTransfer,
        cachedResources: summary.bytes.cached,
        revalidatedResources: summary.bytes.revalidated,
        ttfbMs: newDocument ? at(summary.navigation?.responseStart) : null,
        interactiveMs: newDocument ? at(summary.hydration.interactiveAt) : null,
        serverTiming: serverTimingOf(summary, tracker),
        loading: loadingOf(summary, zero),
        announcements: summary.announcements,
        liveRegions: summary.liveRegions,
        proxy: proxyCheck(ctx, tracker, step.label),
        cdp: cdpDelta(before, after),
      });
      events.length = 0;
    }
    return { steps };
  } finally {
    await session.context.close();
  }
}

async function measureIdle(browser, ctx, cell) {
  const session = await openSession(browser, ctx);
  const { page, tracker } = session;
  try {
    await startAt(session, ctx, cell.path);
    const durationMs = ctx.idleMs ?? cell.durationMs;
    tracker.reset();
    ctx.proxy?.reset();
    await sleep(durationMs);
    const visibility = await page.evaluate(() => document.visibilityState);
    const byClass = {};
    for (const record of tracker.records)
      byClass[record.pathClass] = (byClass[record.pathClass] ?? 0) + 1;
    return {
      durationMs,
      visibility,
      requests: tracker.total,
      requestsByClass: byClass,
      documents: tracker.documents,
      proxy: proxyCheck(ctx, tracker, "idle"),
    };
  } finally {
    await session.context.close();
  }
}

async function measureIntent(browser, ctx, cell) {
  const session = await openSession(browser, ctx);
  const { page, tracker } = session;
  try {
    await startAt(session, ctx, cell.path);
    const startUrl = page.url();
    tracker.reset();
    ctx.proxy?.reset();
    const { gestures, waitMs = INTENT_WINDOW_MS } = await cell.gesture(
      page,
      session,
      ctx,
    );
    const gestureEndAt = performance.now();
    await sleep(waitMs);
    await settle(page, tracker, ctx.timeout);
    const summary = await page.evaluate(() =>
      window.__adminPerfProbe.summary(0),
    );
    return {
      gestures,
      waitMs,
      navigated: page.url() !== startUrl,
      ...intentSummary(tracker.records, {
        gestureEndAt,
        windowMs: INTENT_WINDOW_MS,
      }),
      layoutShiftTotal: round(summary.layoutShiftTotal, 4),
      proxy: proxyCheck(ctx, tracker, "intent"),
      proxyAbortedBeforeFirstByte: ctx.proxy
        ? ctx.proxy
            .snapshot()
            .entries.filter(
              (entry) =>
                entry.pathClass === "record-read" &&
                entry.abortedBeforeFirstByte,
            ).length
        : undefined,
    };
  } finally {
    await session.context.close();
  }
}

async function measureWarm(browser, ctx, cell) {
  const session = await openSession(browser, ctx);
  const { page, tracker } = session;
  try {
    await startAt(session, ctx, cell.start);
    const target = await cell.step.target(page, session, ctx);
    tracker.reset();
    ctx.proxy?.reset();
    await press(page, session, target, ctx);
    await settle(page, tracker, ctx.timeout);
    if (!cell.step.expect(new URL(page.url())))
      throw new Error("warm step ended on the wrong route");
    const summary = await page.evaluate(() =>
      window.__adminPerfProbe.summary(0),
    );
    return {
      documentRequest: tracker.documents > 0,
      requests: tracker.total,
      astroResources: summary.bytes.astroResources,
      astroFromCache: summary.bytes.astroFromCache,
      cachedResources: summary.bytes.cached,
      revalidatedResources: summary.bytes.revalidated,
      proxy: proxyCheck(ctx, tracker, "warm"),
    };
  } finally {
    await session.context.close();
  }
}

async function measureBack(browser, ctx, cell) {
  const session = await openSession(browser, ctx);
  const { page, tracker } = session;
  try {
    await startAt(session, ctx, cell.start);
    const target = await cell.step.target(page, session, ctx);
    await press(page, session, target, ctx);
    await settle(page, tracker, ctx.timeout);
    tracker.reset();
    ctx.proxy?.reset();
    await page.goBack({ waitUntil: "commit", timeout: ctx.timeout });
    await settle(page, tracker, ctx.timeout);
    if (new URL(page.url()).pathname !== "/content")
      throw new Error("back ended on the wrong route");
    const pageshows = await page.evaluate(() =>
      window.__adminPerfProbe.pageshows(),
    );
    const restored = await page.evaluate(() =>
      window.__adminPerfProbe.notRestoredReasons(),
    );
    const last = pageshows.at(-1);
    return {
      restoredFromBfcache: Boolean(last?.persisted),
      documentRequest: tracker.documents > 0,
      requests: tracker.total,
      navigationType: restored.type,
      notRestoredReasons: last?.persisted ? [] : (restored.reasons ?? []),
      proxy: proxyCheck(ctx, tracker, "back"),
    };
  } finally {
    await session.context.close();
  }
}

async function resolveRecordPath(browser, options) {
  const ctx = {
    ...options,
    width: 1280,
    theme: "light",
    input: "mouse",
    proxy: null,
  };
  const session = await openSession(browser, ctx);
  try {
    await startAt(session, ctx, "/content");
    const link = await firstRecordLink(session.page);
    const href = await link.getAttribute("href");
    return new URL(href, options.base).pathname;
  } finally {
    await session.context.close();
  }
}

async function launch(launchOptions) {
  try {
    return await playwright().chromium.launch(launchOptions);
  } catch (error) {
    if (!/Executable doesn't exist|install/i.test(String(error?.message)))
      throw error;
    console.log("installing Playwright Chromium for @anipotts/admin");
    execFileSync(
      "pnpm",
      [
        "--filter",
        "@anipotts/admin",
        "exec",
        "playwright",
        "install",
        "chromium",
      ],
      { cwd: ROOT, stdio: "inherit" },
    );
    return playwright().chromium.launch(launchOptions);
  }
}

let playwrightModule;
function playwright() {
  playwrightModule ??= require("@playwright/test");
  return playwrightModule;
}

/** The browser's own command line, read from chrome://version. */
async function commandLineFlags(browser) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto("chrome://version");
    const text = await page.locator("#command_line").innerText();
    return text
      .split(/\s+(?=--)/)
      .map((flag) => flag.trim())
      .filter((flag) => flag.startsWith("--"));
  } finally {
    await context.close();
  }
}

async function launchBrowsers(options, proxy) {
  const base = options.headlessShell
    ? { headless: true }
    : { headless: true, channel: "chromium" };
  if (proxy) base.proxy = { server: proxy.origin };
  const browsers = {};
  const playwrightDefault = await launch(base);
  const defaultFlags = await commandLineFlags(playwrightDefault);
  if (options.browserModes.includes("playwright"))
    browsers.playwright = {
      browser: playwrightDefault,
      version: playwrightDefault.version(),
      flags: defaultFlags.filter((flag) => REPORTED_FLAG.test(flag)),
    };
  if (options.browserModes.includes("browser-defaults")) {
    const launchExtras = browserDefaultsLaunch(defaultFlags);
    const browser = await launch({ ...base, ...launchExtras });
    const flags = await commandLineFlags(browser);
    if (
      flags.includes("--disable-back-forward-cache") ||
      flags.some(
        (flag) =>
          flag.startsWith("--disable-features=") &&
          flag.split("=")[1].split(",").includes("PaintHolding"),
      )
    )
      throw new Error("--browser-defaults did not reach the browser");
    browsers["browser-defaults"] = {
      browser,
      version: browser.version(),
      flags: flags.filter((flag) => REPORTED_FLAG.test(flag)),
    };
  }
  if (!browsers.playwright) await playwrightDefault.close();
  return browsers;
}

/**
 * Every run in execution order. Groups vary by cell, browser mode, width,
 * theme, input and dwell. Fixed cells (idle, intent, warm, back) run at their
 * own widths, light theme and input. Touch applies below 768 only; dwell
 * applies to switch cells only.
 */
export function buildPlan(cells, options) {
  const groups = [];
  for (const cell of cells)
    for (const mode of options.browserModes) {
      const fixed = Boolean(cell.widths);
      for (const width of fixed ? cell.widths : options.widths)
        for (const theme of fixed ? ["light"] : options.themes)
          for (const input of fixed
            ? [cell.input ?? "mouse"]
            : options.inputs.filter(
                (item) => item === "mouse" || width <= TOUCH_MAX_WIDTH,
              ))
            for (const dwellMs of cell.kind === "switch"
              ? options.dwellsMs
              : [0])
              groups.push({
                group: [cell.id, mode, width, theme, input, dwellMs].join("|"),
                groupIndex: groups.length,
                cell,
                mode,
                width,
                theme,
                input,
                dwellMs,
              });
    }
  const item = (groupEntry, run, warmup) => ({ ...groupEntry, run, warmup });
  if (!options.interleave)
    return groups.flatMap((entry) => [
      ...Array.from({ length: options.warmup }, (_, index) =>
        item(entry, index + 1, true),
      ),
      ...Array.from({ length: options.runs }, (_, index) =>
        item(entry, index + 1, false),
      ),
    ]);
  const plan = [];
  const rounds = [
    ...Array.from({ length: options.warmup }, (_, index) => [index + 1, true]),
    ...Array.from({ length: options.runs }, (_, index) => [index + 1, false]),
  ];
  rounds.forEach(([run, warmup], roundIndex) => {
    const offset = groups.length ? roundIndex % groups.length : 0;
    for (let index = 0; index < groups.length; index++)
      plan.push(item(groups[(index + offset) % groups.length], run, warmup));
  });
  return plan;
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

/** Median (mean of the middle pair when even) and nearest-rank p90. */
function stats(values) {
  const sorted = values
    .filter((value) => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!sorted.length) return { median: null, p90: null, n: 0 };
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  return {
    median: round(median, 4),
    p90: round(percentile(sorted, 0.9), 4),
    n: sorted.length,
  };
}

function numericLeaves(value, prefix = "", out = {}) {
  if (typeof value === "number") out[prefix] = value;
  else if (typeof value === "boolean") out[prefix] = value ? 1 : 0;
  else if (value && typeof value === "object" && !Array.isArray(value))
    for (const [key, child] of Object.entries(value))
      numericLeaves(child, prefix ? `${prefix}.${key}` : key, out);
  return out;
}

function summarize(samples) {
  const leaves = samples.map((sample) => numericLeaves(sample));
  const keys = [...new Set(leaves.flatMap((leaf) => Object.keys(leaf)))].sort();
  return Object.fromEntries(
    keys.map((key) => [key, stats(leaves.map((leaf) => leaf[key]))]),
  );
}

const ms = (stat) =>
  stat?.n ? `${Math.round(stat.median)} / ${Math.round(stat.p90)}` : "n/a";
const kb = (stat) =>
  stat?.n
    ? `${(stat.median / 1024).toFixed(1)} / ${(stat.p90 / 1024).toFixed(1)}`
    : "n/a";
const shift = (stat) =>
  stat?.n ? `${stat.median.toFixed(4)} / ${stat.p90.toFixed(4)}` : "n/a";
const count = (stat) => (stat?.n ? `${stat.median} / ${stat.p90}` : "n/a");

function timingCell(summary, prefix) {
  const parts = Object.entries(summary)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, stat]) => `${key.slice(prefix.length)} ${ms(stat)}`);
  return parts.join(", ") || "none";
}

const FIXED_KEYS = {
  idle: [
    "durationMs",
    "requests",
    "documents",
    "proxy.speculative",
    "proxy.unexplained",
    "proxy.external",
  ],
  intent: [
    "gestures",
    "recordReadsStarted",
    "recordReadsCancelledWithinWindow",
    "recordReadsAbortedBeforeResponse",
    "recordReadsCompleted",
    "recordReadsActiveAfterWindow",
    "scripts",
    "documents",
    "navigated",
    "proxy.speculative",
    "proxyAbortedBeforeFirstByte",
  ],
  warm: [
    "requests",
    "astroResources",
    "astroFromCache",
    "cachedResources",
    "revalidatedResources",
    "proxy.notAtProxy",
  ],
  back: ["restoredFromBfcache", "documentRequest", "requests"],
};

export function markdown(report) {
  const browsers = Object.entries(report.browsers ?? {}).map(
    ([mode, value]) =>
      `${mode} (${typeof value === "string" ? value : `chromium ${value.version}; ${value.flags.join(" ")}`})`,
  );
  const o = report.options;
  const lines = [
    "# admin performance report",
    "",
    `- base: ${report.base}`,
    `- browsers: ${browsers.join("; ") || report.browser}`,
    `- runs per group: ${o.runs}, warm-up runs discarded: ${o.warmup ?? 0}, order: ${o.interleave ? "interleaved" : "blocked"}`,
    `- press gap: ${o.pressGapMs ?? 0} ms, counting proxy: ${o.proxy ? "on" : "off"}`,
    `- cpu throttle: ${o.cpuThrottle}x`,
    `- generated: ${report.generatedAt}`,
    "",
    "Cells show median / p90 in ms unless noted. Definitions are in the JSON `definitions` field.",
    "",
  ];
  const loads = report.cells.filter((cell) => cell.kind === "load");
  if (loads.length) {
    lines.push(
      "## initial loads",
      "",
      "| cell | mode | input | width | theme | ok | ttfb | fcp | lcp | interactive | settled | cls | layout shift total | long tasks | js kb transfer | js kb decoded | requests | status regions (old) | announcements (new) | astryx polite regions | cpu task | heap mb | document server timing | api server timing |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const cell of loads) {
      const s = cell.summary;
      const heap = s["cdp.heapUsedBytes"];
      lines.push(
        `| ${cell.label} | ${cell.mode} | ${cell.input} | ${cell.width} | ${cell.theme} | ${cell.ok}/${cell.runs.length} | ${ms(s.ttfbMs)} | ${ms(s.fcpMs)} | ${ms(s.lcpMs)} | ${ms(s.interactiveMs)} | ${ms(s.settledMs)} | ${shift(s.cls)} | ${shift(s.layoutShiftTotal)} | ${ms(s.longTaskMs)} | ${kb(s.jsTransferBytes)} | ${kb(s.jsDecodedBytes)} | ${count(s.requests)} | ${count(s["loading.maxAnnouncements"])} | ${count(s["announcements.total"])} | ${count(s["liveRegions.astryxPolite"])} | ${ms(s["cdp.taskMs"])} | ${heap?.n ? (heap.median / 1048576).toFixed(1) : "n/a"} | ${timingCell(s, "serverTiming.document.")} | ${timingCell(s, "serverTiming.api.")} |`,
      );
    }
    lines.push("");
  }
  const switches = report.cells.filter((cell) => cell.kind === "switch");
  if (switches.length) {
    lines.push(
      "## in-workspace switches",
      "",
      "| cell | step | mode | input | dwell s | width | theme | ok | document requests | proxy documents | first change | settled | max event | cls | layout shift total | requests | loading visible | status regions (old) | announcements (new) | astryx announcements | cpu task | document server timing | api server timing |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const cell of switches)
      for (const [index, step] of cell.steps.entries()) {
        const s = step.summary;
        const completed = cell.runs.filter((run) => !run.error);
        const documents = completed.filter(
          (run) => run.steps[index].documentRequest,
        ).length;
        lines.push(
          `| ${cell.label} | ${step.label} | ${cell.mode} | ${cell.input} | ${cell.dwellMs / 1000} | ${cell.width} | ${cell.theme} | ${cell.ok}/${cell.runs.length} | ${documents}/${completed.length} | ${count(s["proxy.proxyDocuments"])} | ${ms(s.firstChangeMs)} | ${ms(s.settledMs)} | ${ms(s.eventMs)} | ${shift(s.clsExcludingInput)} | ${shift(s.layoutShiftTotal)} | ${count(s.requests)} | ${ms(s["loading.visibleMs"])} | ${count(s["loading.maxAnnouncements"])} | ${count(s["announcements.total"])} | ${count(s["announcements.astryx"])} | ${ms(s["cdp.taskMs"])} | ${timingCell(s, "serverTiming.document.")} | ${timingCell(s, "serverTiming.api.")} |`,
        );
      }
    lines.push("");
  }
  for (const kind of ["idle", "intent", "warm", "back"]) {
    const fixed = report.cells.filter((cell) => cell.kind === kind);
    if (!fixed.length) continue;
    const keys = FIXED_KEYS[kind];
    lines.push(
      `## ${kind} cells`,
      "",
      `| cell | mode | input | width | ok | ${keys.join(" | ")} |`,
      `| ${["cell", "mode", "input", "width", "ok", ...keys].map(() => "---").join(" | ")} |`,
    );
    for (const cell of fixed)
      lines.push(
        `| ${cell.id} | ${cell.mode} | ${cell.input} | ${cell.width} | ${cell.ok}/${cell.runs.length} | ${keys.map((key) => count(cell.summary[key])).join(" | ")} |`,
      );
    if (kind === "back")
      for (const cell of fixed) {
        const reasons = [
          ...new Set(cell.runs.flatMap((run) => run.notRestoredReasons ?? [])),
        ];
        lines.push(
          "",
          `${cell.mode} not-restored reasons: ${reasons.join(", ") || "none"}`,
        );
      }
    lines.push("");
  }
  lines.push("## problems", "");
  if (report.problems.length)
    for (const problem of report.problems)
      lines.push(
        `- ${problem.cell} ${problem.mode ?? ""} ${problem.width} ${problem.theme} run ${problem.run}: ${problem.message}`,
      );
  else lines.push("none");
  lines.push("");
  return lines.join("\n");
}

function loadAverage() {
  try {
    return execFileSync("sysctl", ["-n", "vm.loadavg"], { encoding: "utf8" })
      .replace(/[{}]/g, "")
      .trim()
      .split(/\s+/)
      .map(Number);
  } catch {
    return null;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.list) {
    for (const cell of CELLS)
      console.log(`${cell.id}\t${cell.label}${cell.optIn ? " (opt-in)" : ""}`);
    return;
  }
  if (!options.out)
    throw new Error(
      "usage: perf-measure.mjs <out.json> [options] (--list for cells)",
    );
  const unknown = (options.cells ?? []).filter(
    (id) => !CELLS.some((cell) => cell.id === id),
  );
  if (unknown.length) throw new Error(`unknown cells: ${unknown.join(", ")}`);
  const cells = options.cells
    ? CELLS.filter((cell) => options.cells.includes(cell.id))
    : CELLS.filter((cell) => !cell.optIn);

  const preflight = await fetch(`${options.base}/content`, {
    redirect: "manual",
  }).catch(() => null);
  if (!preflight || preflight.status !== 200)
    throw new Error(
      `${options.base}/content answered ${preflight?.status ?? "nothing"}; start pnpm preview:admin:owner first`,
    );

  const proxy = options.proxy
    ? await startCountingProxy({ upstream: options.base })
    : null;
  const browsers = await launchBrowsers(options, proxy);
  const report = {
    schema: 2,
    base: options.base,
    browser: `chromium ${Object.values(browsers)[0].version}${options.headlessShell ? " headless shell" : ""}`,
    browsers: Object.fromEntries(
      Object.entries(browsers).map(([mode, { version, flags }]) => [
        mode,
        { version, flags },
      ]),
    ),
    generatedAt: new Date().toISOString(),
    loadAverage: { start: loadAverage(), end: null },
    options: {
      runs: options.runs,
      warmup: options.warmup,
      interleave: options.interleave,
      widths: options.widths,
      themes: options.themes,
      inputs: options.inputs,
      dwellsMs: options.dwellsMs,
      browserModes: options.browserModes,
      pressGapMs: options.pressGapMs,
      proxy: options.proxy,
      idleMs: options.idleMs,
      cells: cells.map((cell) => cell.id),
      cpuThrottle: options.cpuThrottle,
      quietMs: QUIET_MS,
      timeoutMs: options.timeout,
    },
    definitions: METRIC_DEFINITIONS,
    cells: [],
    problems: [],
  };
  try {
    let recordPath = null;
    if (cells.some((cell) => cell.id === "load:record")) {
      recordPath = await resolveRecordPath(
        Object.values(browsers)[0].browser,
        options,
      ).catch((error) => {
        report.problems.push({
          cell: "load:record",
          width: 1280,
          theme: "light",
          run: 0,
          message: sanitizeMessage(error),
        });
        return null;
      });
    }
    const plan = buildPlan(
      cells.filter((cell) => cell.id !== "load:record" || recordPath),
      options,
    );
    const results = new Map();
    const expected = new Map();
    for (const item of plan)
      expected.set(item.group, (expected.get(item.group) ?? 0) + 1);
    for (const item of plan) {
      const ctx = {
        ...options,
        width: item.width,
        theme: item.theme,
        input: item.input,
        dwellMs: item.dwellMs,
        proxy,
      };
      const { browser } = browsers[item.mode];
      const { cell } = item;
      let result;
      try {
        if (cell.kind === "load")
          result = await measureLoad(
            browser,
            ctx,
            cell.id === "load:record" ? recordPath : cell.path,
          );
        else if (cell.kind === "switch")
          result = await measureSwitch(browser, ctx, cell);
        else if (cell.kind === "idle")
          result = await measureIdle(browser, ctx, cell);
        else if (cell.kind === "intent")
          result = await measureIntent(browser, ctx, cell);
        else if (cell.kind === "warm")
          result = await measureWarm(browser, ctx, cell);
        else result = await measureBack(browser, ctx, cell);
      } catch (error) {
        const message = sanitizeMessage(error);
        result = { error: message };
        if (!item.warmup)
          report.problems.push({
            cell: cell.id,
            mode: item.mode,
            width: item.width,
            theme: item.theme,
            input: item.input,
            dwellMs: item.dwellMs,
            run: item.run,
            message,
          });
      }
      const entry = results.get(item.group) ?? {
        item,
        runs: [],
        discarded: 0,
        done: 0,
      };
      results.set(item.group, entry);
      entry.done++;
      if (item.warmup) entry.discarded++;
      else entry.runs.push(result);
      if (entry.done === expected.get(item.group)) {
        const ok = entry.runs.filter((run) => !run.error);
        const headline =
          cell.kind === "switch"
            ? cell.steps
                .map(
                  (step, index) =>
                    `${step.label}: ${ms(stats(ok.map((run) => run.steps[index].firstChangeMs)))}`,
                )
                .join("; ")
            : cell.kind === "load"
              ? `interactive ${ms(stats(ok.map((run) => run.interactiveMs)))}`
              : "";
        console.log(
          `${cell.id} ${item.mode} ${item.width} ${item.theme} ${item.input} dwell ${item.dwellMs / 1000}s: ${ok.length}/${entry.runs.length} ok ${headline}`,
        );
      }
    }
    for (const { item, runs, discarded } of [...results.values()].sort(
      (a, b) => a.item.groupIndex - b.item.groupIndex,
    )) {
      const { cell } = item;
      const ok = runs.filter((run) => !run.error);
      const path = cell.id === "load:record" ? recordPath : cell.path;
      const entry = {
        id: cell.id,
        kind: cell.kind,
        label: cell.label,
        route: routeLabel(new URL(path ?? cell.start, options.base)),
        mode: item.mode,
        input: item.input,
        dwellMs: item.dwellMs,
        width: item.width,
        theme: item.theme,
        ok: ok.length,
        warmupDiscarded: discarded,
        runs,
      };
      if (cell.kind === "switch")
        entry.steps = cell.steps.map((step, index) => ({
          label: step.label,
          summary: summarize(ok.map((run) => run.steps[index])),
        }));
      else entry.summary = summarize(ok);
      report.cells.push(entry);
    }
  } finally {
    await Promise.all(
      Object.values(browsers).map(({ browser }) => browser.close()),
    );
    await proxy?.close();
  }
  report.loadAverage.end = loadAverage();

  const out = resolve(options.out);
  const md = resolve(options.md ?? out.replace(/\.json$/i, "") + ".md");
  mkdirSync(dirname(out), { recursive: true });
  mkdirSync(dirname(md), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(md, markdown(report));
  console.log(`json: ${out}\nmarkdown: ${md}`);
  if (report.problems.length) {
    console.error(`${report.problems.length} runs failed; see problems`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(sanitizeMessage(error));
    process.exitCode = 1;
  });
