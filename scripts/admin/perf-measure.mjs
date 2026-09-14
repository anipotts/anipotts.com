#!/usr/bin/env node

// Admin performance baseline: initial loads and in-workspace switches.
//
//   node scripts/admin/perf-measure.mjs <out.json> [options]
//
// It starts nothing. Serve Admin first, normally with
// `pnpm preview:admin:owner` from the same worktree, then point this at it.
// Every run opens a fresh Chromium context, so no cache, cookie or storage
// carries from one run to the next.
//
// Options:
//   --base <origin>     loopback origin (default http://127.0.0.1:8871)
//   --runs <n>          runs per cell, width and theme (default 5)
//   --widths <list>     viewport widths (default 390,768,1280)
//   --themes <list>     light,dark (default both)
//   --cells <list>      cell ids (default all); --list prints them
//   --md <file>         markdown summary (default: the JSON path with .md)
//   --cpu-throttle <n>  CDP CPU slowdown factor (default 1)
//   --timeout <ms>      budget for each readiness wait (default 30000)
//   --headless-shell    use chrome-headless-shell instead of new headless
//
// Waits are readiness checks, never fixed sleeps: a run is settled when the
// document is complete, every client:load island has committed its React
// hydration, no request is in flight and the DOM has been quiet for 300ms.
//
// The report holds durations, counts, byte sizes and generic route labels.
// Record routes appear as /content/:collection/:id, query strings are dropped,
// and no page text, record identity, draft or Life content is collected.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const playwright = createRequire(join(ROOT, "apps/admin/package.json"))(
  "@playwright/test",
);

const QUIET_MS = 300;
const HEIGHTS = { 390: 844, 768: 1024, 1280: 900 };
const REGION_ID = "astryx-app-shell-main";
const CLICK_KEY = "__adminPerfInput";
// Loading states owned by Astryx and Admin components. Presence only: the probe
// never forces layout to test visibility.
const LOADING_SELECTOR = [
  ".astryx-skeleton",
  ".admin-loading",
  '[aria-busy="true"]',
].join(", ");
const RECORD_PATH =
  /^\/content\/(home|page|work|writing|projects|workPage|writingPage|systemsPage|newsletterPage)\/[^/]+$/;

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
    "latest of last DOM mutation, last resource response end, interactive and load, before a 300ms quiet window with no request in flight.",
  cls: "largest session window (1s gap, 5s cap) of layout shifts without recent input.",
  layoutShiftTotal: "sum of every layout shift, including input-adjacent ones.",
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
  documentRequest: "the switch issued a main-frame document request.",
  firstChangeMs:
    "input click to the first frame showing a change in the workspace region. In place: first mutation inside #astryx-app-shell-main, then requestAnimationFrame plus a MessageChannel task. New document: the later of its first-contentful-paint and that same marker.",
  eventMs:
    "largest Event Timing entry (durationThreshold 16) with an interactionId from the input. Null when every entry was under 16ms or the old document unloaded before reporting.",
  loading:
    "time a loading element (.astryx-skeleton, .admin-loading, [aria-busy=true]) was present after the input. maxCount counts loading elements at once, maxAnnouncements the distinct role=status ancestors announcing them, and stillVisible means one was present at settle.",
};

function parseArgs(argv) {
  const options = {
    base: "http://127.0.0.1:8871",
    runs: 5,
    widths: [390, 768, 1280],
    themes: ["light", "dark"],
    cells: null,
    md: null,
    out: null,
    cpuThrottle: 1,
    timeout: 30000,
    headlessShell: false,
    list: false,
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
    else if (arg === "--base") options.base = value(index++);
    else if (arg === "--md") options.md = value(index++);
    else if (arg === "--runs") options.runs = Number(value(index++));
    else if (arg === "--cpu-throttle")
      options.cpuThrottle = Number(value(index++));
    else if (arg === "--timeout") options.timeout = Number(value(index++));
    else if (arg === "--widths")
      options.widths = value(index++).split(",").map(Number);
    else if (arg === "--themes") options.themes = value(index++).split(",");
    else if (arg === "--cells") options.cells = value(index++).split(",");
    else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else if (!options.out) options.out = arg;
    else throw new Error(`unexpected argument ${arg}`);
  }
  if (!Number.isInteger(options.runs) || options.runs < 1)
    throw new Error("--runs must be a positive integer");
  if (!options.widths.every((width) => Number.isInteger(width) && width > 0))
    throw new Error("--widths must be positive integers");
  if (!options.themes.every((theme) => ["light", "dark"].includes(theme)))
    throw new Error("--themes accepts light and dark");
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

const navLink = (workspace, label, expect) => ({
  label,
  async target(page) {
    const link = page
      .locator(
        `nav[aria-label="${workspace}"], dialog[aria-label="Navigation"]`,
      )
      .getByRole("link", { name: label, exact: true })
      .filter({ visible: true })
      .first();
    // Narrow layouts keep the workspace navigation in a drawer.
    if (!(await link.isVisible())) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await link.waitFor({ state: "visible" });
    }
    return link;
  },
  expect,
});

const firstRecordLink = async (page) => {
  const links = page
    .locator(`#${REGION_ID} a[href^="/content/"]`)
    .filter({ visible: true });
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

const CELLS = [
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
];

function group(url, pathname, value) {
  return url.pathname === pathname && url.searchParams.get("group") === value;
}

/** Runs in every document before its own scripts. Serialized by Playwright. */
function installPerfProbe({ regionId, loadingSelector, clickKey }) {
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
  };
  const loadingElements = new Set();
  const committedRoots = new WeakMap();
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
    const announcements = new Set(
      [...loadingElements]
        .map((element) => element.closest('[role="status"]'))
        .filter(Boolean),
    ).size;
    if (count && !state.loadingOpen) {
      state.loadingOpen = { start: t, end: null, max: count, announcements };
      state.loading.push(state.loadingOpen);
    } else if (count) {
      state.loadingOpen.max = Math.max(state.loadingOpen.max, count);
      state.loadingOpen.announcements = Math.max(
        state.loadingOpen.announcements,
        announcements,
      );
    } else if (state.loadingOpen) {
      state.loadingOpen.end = t;
      state.loadingOpen = null;
    }
  };
  new MutationObserver((records) => {
    const t = now();
    state.lastMutation = t;
    trackLoading(t, records);
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
      };
      const api = [];
      let lastResourceEnd = 0;
      for (const entry of resources) {
        const url = new URL(entry.name, location.href);
        lastResourceEnd = Math.max(lastResourceEnd, entry.responseEnd);
        bytes.totalTransfer += entry.transferSize;
        if (entry.transferSize === 0 && entry.decodedBodySize > 0)
          bytes.cached++;
        else if (
          entry.transferSize > 0 &&
          entry.transferSize < entry.encodedBodySize
        )
          bytes.revalidated++;
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

function trackRequests(page) {
  const inflight = new Set();
  const waiters = new Set();
  const tracker = {
    total: 0,
    byType: {},
    documents: 0,
    apiStatus: {},
    pendingDocument: false,
    lastActivity: performance.now(),
    reset() {
      tracker.total = 0;
      tracker.byType = {};
      tracker.documents = 0;
      tracker.apiStatus = {};
    },
    get inflight() {
      return inflight.size;
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
  page.on("request", (request) => {
    inflight.add(request);
    tracker.total++;
    const type = request.resourceType();
    tracker.byType[type] = (tracker.byType[type] ?? 0) + 1;
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      tracker.documents++;
      tracker.pendingDocument = true;
    }
    tracker.lastActivity = performance.now();
  });
  const finished = (request) => {
    inflight.delete(request);
    tracker.lastActivity = performance.now();
    if (
      request.isNavigationRequest() &&
      request.frame() === page.mainFrame() &&
      request.failure()
    )
      settleDocument();
  };
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.origin === new URL(page.url()).origin &&
      url.pathname.startsWith("/api/")
    )
      tracker.apiStatus[sanitizePath(url.pathname)] = response.status();
  });
  page.on("requestfinished", finished);
  page.on("requestfailed", finished);
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) settleDocument();
  });
  return tracker;
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

async function openSession(browser, options, width, theme) {
  const context = await browser.newContext({
    viewport: { width, height: HEIGHTS[width] ?? 900 },
    deviceScaleFactor: 1,
    colorScheme: theme,
    serviceWorkers: "block",
  });
  await context.addCookies([
    { name: "ap-theme", value: theme, url: options.base },
  ]);
  const events = [];
  await context.exposeBinding("__adminPerfEmit", (_source, payload) => {
    if (payload && typeof payload === "object") events.push(payload);
  });
  await context.addInitScript(installPerfProbe, {
    regionId: REGION_ID,
    loadingSelector: LOADING_SELECTOR,
    clickKey: CLICK_KEY,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  if (options.cpuThrottle > 1)
    await cdp.send("Emulation.setCPUThrottlingRate", {
      rate: options.cpuThrottle,
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

async function measureLoad(browser, options, path, width, theme) {
  const session = await openSession(browser, options, width, theme);
  const { page, tracker, cdp } = session;
  try {
    const before = await cdpMetrics(cdp);
    await page.goto(options.base + path, {
      waitUntil: "commit",
      timeout: options.timeout,
    });
    await settle(page, tracker, options.timeout);
    await assertTheme(page, theme);
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
      serverTiming: serverTimingOf(summary, tracker),
      loading: loadingOf(summary, summary.origin),
      cdp: cdpDelta(before, after),
    };
  } finally {
    await session.context.close();
  }
}

async function measureSwitch(browser, options, cell, width, theme) {
  const session = await openSession(browser, options, width, theme);
  const { page, tracker, cdp, events } = session;
  try {
    await page.goto(options.base + cell.start, {
      waitUntil: "commit",
      timeout: options.timeout,
    });
    await settle(page, tracker, options.timeout);
    await assertTheme(page, theme);
    const steps = [];
    for (const step of cell.steps) {
      const target = await step.target(page);
      await target.waitFor({ state: "visible", timeout: options.timeout });
      const before = await cdpMetrics(cdp);
      tracker.reset();
      await target.click({ timeout: options.timeout });
      await settle(page, tracker, options.timeout);
      if (!step.expect(new URL(page.url())))
        throw new Error(
          `${step.label} ended on ${sanitizePath(new URL(page.url()).pathname)}`,
        );
      await assertTheme(page, theme);
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
        cdp: cdpDelta(before, after),
      });
      events.length = 0;
    }
    return { steps };
  } finally {
    await session.context.close();
  }
}

async function resolveRecordPath(browser, options) {
  const session = await openSession(browser, options, 1280, "light");
  try {
    await session.page.goto(`${options.base}/content`, {
      waitUntil: "commit",
      timeout: options.timeout,
    });
    await settle(session.page, session.tracker, options.timeout);
    const link = await firstRecordLink(session.page);
    const href = await link.getAttribute("href");
    return new URL(href, options.base).pathname;
  } finally {
    await session.context.close();
  }
}

async function launch(options) {
  const launchOptions = options.headlessShell
    ? { headless: true }
    : { headless: true, channel: "chromium" };
  try {
    return await playwright.chromium.launch(launchOptions);
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
    return playwright.chromium.launch(launchOptions);
  }
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
  stat?.n ? `${stat.median.toFixed(3)} / ${stat.p90.toFixed(3)}` : "n/a";
const count = (stat) => (stat?.n ? `${stat.median} / ${stat.p90}` : "n/a");

function timingCell(summary, prefix) {
  const parts = Object.entries(summary)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, stat]) => `${key.slice(prefix.length)} ${ms(stat)}`);
  return parts.join(", ") || "none";
}

function markdown(report) {
  const lines = [
    "# admin performance baseline",
    "",
    `- base: ${report.base}`,
    `- browser: ${report.browser}`,
    `- runs per width and theme: ${report.options.runs}`,
    `- cpu throttle: ${report.options.cpuThrottle}x`,
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
      "| cell | width | theme | ok | ttfb | fcp | lcp | interactive | settled | cls | long tasks | js kb transfer | js kb decoded | requests | cpu task | heap mb | document server timing | api server timing |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const cell of loads) {
      const s = cell.summary;
      const heap = s["cdp.heapUsedBytes"];
      lines.push(
        `| ${cell.label} | ${cell.width} | ${cell.theme} | ${cell.ok}/${cell.runs.length} | ${ms(s.ttfbMs)} | ${ms(s.fcpMs)} | ${ms(s.lcpMs)} | ${ms(s.interactiveMs)} | ${ms(s.settledMs)} | ${shift(s.cls)} | ${ms(s.longTaskMs)} | ${kb(s.jsTransferBytes)} | ${kb(s.jsDecodedBytes)} | ${count(s.requests)} | ${ms(s["cdp.taskMs"])} | ${heap?.n ? (heap.median / 1048576).toFixed(1) : "n/a"} | ${timingCell(s, "serverTiming.document.")} | ${timingCell(s, "serverTiming.api.")} |`,
      );
    }
    lines.push("");
  }
  const switches = report.cells.filter((cell) => cell.kind === "switch");
  if (switches.length) {
    lines.push(
      "## in-workspace switches",
      "",
      "| cell | step | width | theme | ok | document requests | first change | settled | max event | cls | requests | loading visible | loading announcements | cpu task | document server timing | api server timing |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const cell of switches)
      for (const [index, step] of cell.steps.entries()) {
        const s = step.summary;
        const completed = cell.runs.filter((run) => !run.error);
        const documents = completed.filter(
          (run) => run.steps[index].documentRequest,
        ).length;
        lines.push(
          `| ${cell.label} | ${step.label} | ${cell.width} | ${cell.theme} | ${cell.ok}/${cell.runs.length} | ${documents}/${completed.length} | ${ms(s.firstChangeMs)} | ${ms(s.settledMs)} | ${ms(s.eventMs)} | ${shift(s.clsExcludingInput)} | ${count(s.requests)} | ${ms(s["loading.visibleMs"])} | ${count(s["loading.maxAnnouncements"])} | ${ms(s["cdp.taskMs"])} | ${timingCell(s, "serverTiming.document.")} | ${timingCell(s, "serverTiming.api.")} |`,
        );
      }
    lines.push("");
  }
  lines.push("## problems", "");
  if (report.problems.length)
    for (const problem of report.problems)
      lines.push(
        `- ${problem.cell} ${problem.width} ${problem.theme} run ${problem.run}: ${problem.message}`,
      );
  else lines.push("none");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.list) {
    for (const cell of CELLS) console.log(`${cell.id}\t${cell.label}`);
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
    : CELLS;

  const preflight = await fetch(`${options.base}/content`, {
    redirect: "manual",
  }).catch(() => null);
  if (!preflight || preflight.status !== 200)
    throw new Error(
      `${options.base}/content answered ${preflight?.status ?? "nothing"}; start pnpm preview:admin:owner first`,
    );

  const browser = await launch(options);
  const report = {
    schema: 1,
    base: options.base,
    browser: `chromium ${browser.version()}${options.headlessShell ? " headless shell" : ""}`,
    generatedAt: new Date().toISOString(),
    options: {
      runs: options.runs,
      widths: options.widths,
      themes: options.themes,
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
      recordPath = await resolveRecordPath(browser, options).catch((error) => {
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
    for (const cell of cells) {
      const path = cell.id === "load:record" ? recordPath : cell.path;
      if (cell.kind === "load" && !path) continue;
      for (const width of options.widths)
        for (const theme of options.themes) {
          const runs = [];
          for (let run = 1; run <= options.runs; run++) {
            try {
              runs.push(
                cell.kind === "load"
                  ? await measureLoad(browser, options, path, width, theme)
                  : await measureSwitch(browser, options, cell, width, theme),
              );
            } catch (error) {
              const message = sanitizeMessage(error);
              runs.push({ error: message });
              report.problems.push({
                cell: cell.id,
                width,
                theme,
                run,
                message,
              });
            }
          }
          const ok = runs.filter((run) => !run.error);
          const entry = {
            id: cell.id,
            kind: cell.kind,
            label: cell.label,
            route: routeLabel(new URL(path ?? cell.start, options.base)),
            width,
            theme,
            ok: ok.length,
            runs,
          };
          if (cell.kind === "load") entry.summary = summarize(ok);
          else
            entry.steps = cell.steps.map((step, index) => ({
              label: step.label,
              summary: summarize(ok.map((run) => run.steps[index])),
            }));
          report.cells.push(entry);
          const headline =
            cell.kind === "load"
              ? `interactive ${ms(entry.summary.interactiveMs)}`
              : entry.steps
                  .map(
                    (step) =>
                      `${step.label}: ${ms(step.summary.firstChangeMs)}`,
                  )
                  .join("; ");
          console.log(
            `${cell.id} ${width} ${theme}: ${ok.length}/${runs.length} ok, ${headline}`,
          );
        }
    }
  } finally {
    await browser.close();
  }

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

main().catch((error) => {
  console.error(sanitizeMessage(error));
  process.exitCode = 1;
});
