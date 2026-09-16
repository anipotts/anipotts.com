// Per-frame collision probe for the writing card choreography.
//
// Sampling is paint timed: a ResizeObserver on a 1px sentinel whose width
// flips every animation frame fires once per rendering update, after every
// requestAnimationFrame callback (including the page's own wave writer) and
// after style and layout, so each sample reads what that frame paints. For
// every such frame of each step it records:
// - pairs of text layers above 0.3 opacity whose line boxes intersect: the
//   transition overlays, the live headings, summaries and dates they stand in
//   for, and text inside the ghost's shadow root. Live or ghost text under the
//   opaque surface is skipped where the intersection sits inside the clip;
// - date and title pairs among those collisions;
// - frames where the wave wrapper box leaves the surface clip box, and the
//   widest horizontal gap between band and clip;
// - frames where a visible morph layer carries a straight horizontal edge
//   (10 or more neighbouring columns inside the canvas within half a unit);
// and after the step settles: overlays left, inline-hidden elements, running
// animations, the transition flag and where focus landed.
// Usage: BASE=http://127.0.0.1:8860 OUT=/tmp/bench/probe node probe.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import {
  chromium,
  launchOptions,
  option,
  profiles,
  runSteps,
  webkit,
} from "./common.mjs";

const BASE = option("BASE");
const OUT = option("OUT");
const THEME = option("THEME", "dark");
// ENGINE=webkit runs the same probe in WebKit, without CPU throttling.
const ENGINE = option("ENGINE", "chromium");
const result = { base: BASE, theme: THEME, engine: ENGINE };

function install() {
  const live = [
    "[data-writing-article] > header h1",
    "[data-writing-article] > header .summary",
    "[data-writing-article] > header time",
    "main .page-hero__title",
    "main .page-hero__summary",
    "main a.writing-card .title",
    "main a.writing-card .sub",
    "main a.writing-card time",
  ];
  const ghostText =
    "h1, h2, .title, .summary, time, .page-hero__title, .page-hero__summary, .sub";
  const probe = {
    frames: 0,
    animated: 0,
    collisions: [],
    dateTitle: [],
    outside: [],
    gutter: 0,
    gutters: [],
    flat: [],
    clipOffscreen: 0,
    start: performance.now(),
  };
  window.__probe = probe;
  const sentinel = document.createElement("div");
  sentinel.style.cssText =
    "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
  document.documentElement.appendChild(sentinel);

  // Effective opacity through ancestors and shadow hosts.
  const opacity = (el) => {
    if (getComputedStyle(el).visibility !== "visible") return 0;
    let o = 1;
    for (let n = el; n;) {
      if (n.nodeType === 1) {
        const style = getComputedStyle(n);
        if (style.display === "none") return 0;
        o *= Number(style.opacity);
        n = n.parentNode;
      } else if (n instanceof ShadowRoot) n = n.host;
      else break;
    }
    return o;
  };
  const insetBox = (value) => {
    const m = /inset\(([^)]*?)(?:\s+round[^)]*)?\)/.exec(value || "");
    if (!m) return null;
    const v = m[1].trim().split(/\s+/).map(parseFloat);
    const [t, r = t, b = t, l = r] = v;
    return { left: l, top: t, right: innerWidth - r, bottom: innerHeight - b };
  };
  const intersection = (a, b) => {
    const box = {
      left: Math.max(a.left, b.left),
      top: Math.max(a.top, b.top),
      right: Math.min(a.right, b.right),
      bottom: Math.min(a.bottom, b.bottom),
    };
    return box.right - box.left > 1 && box.bottom - box.top > 1 ? box : null;
  };
  const inside = (a, clip) =>
    a.left >= clip.left - 0.5 &&
    a.top >= clip.top - 0.5 &&
    a.right <= clip.right + 0.5 &&
    a.bottom <= clip.bottom + 0.5;
  // Line boxes rather than block boxes, so a wide heading block does not
  // count as touching text beside its last line.
  const textRect = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const box = range.getBoundingClientRect();
    return box.width ? box : el.getBoundingClientRect();
  };
  const round = (v) => +v.toFixed(1);

  const flatEdges = (wrapper, t) =>
    wrapper.querySelectorAll("path").forEach((path, index) => {
      const shown =
        Number(path.getAttribute("opacity") ?? 1) *
        Number(getComputedStyle(wrapper).opacity);
      if (shown < 0.02) return;
      const d = path.getAttribute("d") || "";
      for (const run of d.slice(1, -1).split("L")) {
        const numbers = run.match(/-?[\d.]+/g)?.map(Number) ?? [];
        // Column points: the start, then every curve's end point.
        const ys = [numbers[1]];
        for (let i = 2; i + 5 < numbers.length + 1; i += 6)
          ys.push(numbers[i + 5]);
        let longest = 1;
        let level = 0;
        for (let i = 0; i < ys.length; i++)
          for (let j = i; j < ys.length; j++) {
            const part = ys.slice(i, j + 1);
            if (!part.every((y) => y > 0 && y < 800)) break;
            if (Math.max(...part) - Math.min(...part) >= 0.5) break;
            if (part.length > longest) [longest, level] = [part.length, ys[i]];
          }
        if (longest >= 10) {
          probe.flat.push({ t, layer: index, columns: longest, y: level });
          break;
        }
      }
    });

  const sample = () => {
    const surface = document.querySelector(".writing-transition-surface");
    if (!document.documentElement.dataset.writingTransition && !surface) return;
    const t = +(performance.now() - probe.start).toFixed(0);
    probe.frames++;
    probe.animated++;
    const clip = surface && insetBox(getComputedStyle(surface).clipPath);
    if (clip && (clip.top < -1 || clip.bottom > innerHeight + 1))
      probe.clipOffscreen++;
    const main = document.querySelector("main");
    const mainAbove = main && Number(getComputedStyle(main).zIndex) > 200;

    const wrapper = document.querySelector(".writing-transition-waves");
    if (wrapper && clip && opacity(wrapper) > 0.02) {
      const w = wrapper.getBoundingClientRect();
      // The header band spans the clip's width: any horizontal gap between
      // the band and the clip edge shows as a dark gutter.
      const gap = round(Math.max(w.left - clip.left, clip.right - w.right));
      probe.gutter = Math.max(probe.gutter, gap);
      if (gap > 2 && probe.gutters.length < 20)
        probe.gutters.push({
          t,
          wrapper: [w.left, w.right].map(round),
          clip: [clip.left, clip.right].map(round),
          surfaceTime: surface.getAnimations()[0]?.currentTime ?? null,
          transform: wrapper.style.transform,
        });
      if (!inside(w, clip))
        probe.outside.push({
          t,
          wrapper: [w.left, w.top, w.right, w.bottom].map(round),
          clip: [clip.left, clip.top, clip.right, clip.bottom].map(round),
        });
    }
    if (wrapper) flatEdges(wrapper, t);

    const layers = [];
    document.querySelectorAll(".writing-transition-word").forEach((el) =>
      layers.push({
        name: `overlay:${el.dataset.layer}`,
        overlay: true,
        r: textRect(el),
        o: opacity(el),
      }),
    );
    live.forEach((selector) =>
      document.querySelectorAll(selector).forEach((el, i) => {
        const r = textRect(el);
        if (r.bottom < 0 || r.top > innerHeight || !r.width) return;
        layers.push({
          name: `live:${selector}#${i}`,
          r,
          o: opacity(el),
          under: !mainAbove,
        });
      }),
    );
    document
      .querySelectorAll(
        ".writing-transition-ghost, .writing-transition-surface",
      )
      .forEach((host) => {
        const root = host.shadowRoot || host;
        root.querySelectorAll(ghostText).forEach((el, i) => {
          if (el.closest(".writing-transition-word")) return;
          const r = textRect(el);
          if (r.bottom < 0 || r.top > innerHeight || !r.width) return;
          layers.push({
            name: `ghost:${el.className || el.tagName}#${i}`,
            ghost: true,
            r,
            o: opacity(el),
            under: host !== surface,
          });
        });
      });

    const visible = layers.filter((l) => l.o > 0.3);
    for (let i = 0; i < visible.length; i++)
      for (let j = i + 1; j < visible.length; j++) {
        const a = visible[i];
        const b = visible[j];
        // Live text against live text is the page's own layout; ghost text
        // against ghost text is the old page's.
        if (!a.overlay && !b.overlay && !a.ghost === !b.ghost) continue;
        const cross = intersection(a.r, b.r);
        if (!cross) continue;
        const hidden = (l) =>
          !l.overlay && l.under && clip && inside(cross, clip);
        if (hidden(a) || hidden(b)) continue;
        const record = {
          t,
          a: a.name,
          b: b.name,
          oa: +a.o.toFixed(2),
          ob: +b.o.toFixed(2),
        };
        probe.collisions.push(record);
        const names = a.name + b.name;
        if (/date|time/.test(names) && /title|h1/.test(names))
          probe.dateTitle.push(record);
      }
  };

  const observer = new ResizeObserver(sample);
  observer.observe(sentinel);
  let flip = false;
  const tick = () => {
    flip = !flip;
    sentinel.style.width = flip ? "2px" : "1px";
    if (performance.now() - probe.start < 1500) requestAnimationFrame(tick);
    else {
      observer.disconnect();
      sentinel.remove();
    }
  };
  requestAnimationFrame(tick);
}

const browser = await (ENGINE === "webkit" ? webkit : chromium).launch(
  launchOptions(ENGINE, { headless: true }),
);
for (const p of profiles(THEME)) {
  const { defaultBrowserType: _engine, ...contextOptions } = p.context;
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  if (ENGINE === "chromium") {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: p.cpu });
  }
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${BASE}/writing?theme=${THEME}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(1200);
  result[p.name] = [];
  async function capture(label, _selector, action) {
    await page.evaluate(install);
    await action();
    await page.waitForTimeout(1700);
    const settled = await page.evaluate(() => {
      const active = document.activeElement;
      return {
        url: location.pathname,
        overlays: document.querySelectorAll(
          ".writing-transition-surface,.writing-transition-word,.writing-transition-ghost,.writing-transition-waves",
        ).length,
        hidden: [...document.querySelectorAll("body *")].filter(
          (el) => el.style.visibility === "hidden",
        ).length,
        running: document
          .getAnimations()
          .filter((a) => a.playState === "running").length,
        flag: document.documentElement.dataset.writingTransition ?? null,
        focus: active
          ? `${active.tagName.toLowerCase()}${active.className ? "." + String(active.className).split(" ").join(".") : ""} ${active.getAttribute("href") || ""}`.trim()
          : null,
        probe: window.__probe,
      };
    });
    const { probe, ...after } = settled;
    const row = {
      label,
      frames: probe.frames,
      animatedFrames: probe.animated,
      collisionFrames: new Set(probe.collisions.map((c) => c.t)).size,
      dateTitleFrames: new Set(probe.dateTitle.map((c) => c.t)).size,
      outsideFrames: probe.outside.length,
      maxGutterPx: probe.gutter,
      clipOffscreenFrames: probe.clipOffscreen,
      gutters: probe.gutters,
      // Interior: a straight edge crossing the surface. Near the canvas edge
      // (within 3 percent): a wave settling onto the destination artwork's
      // own straight canvas boundary in the last frames, reported apart.
      flatEdgeFrames: new Set(
        probe.flat.filter((f) => f.y > 24 && f.y < 776).map((f) => f.t),
      ).size,
      flatAtCanvasEdgeFrames: new Set(
        probe.flat.filter((f) => f.y <= 24 || f.y >= 776).map((f) => f.t),
      ).size,
      flat: probe.flat.slice(0, 20),
      collisions: probe.collisions.slice(0, 20),
      outside: probe.outside.slice(0, 20),
      after,
    };
    result[p.name].push(row);
    console.log(
      ENGINE,
      p.name,
      label,
      `frames ${row.frames} collisions ${row.collisionFrames} date-title ${row.dateTitleFrames} outside ${row.outsideFrames} gutter ${row.maxGutterPx} flat ${row.flatEdgeFrames} (canvas edge ${row.flatAtCanvasEdgeFrames}) overlays ${after.overlays} hidden ${after.hidden} running ${after.running} focus ${after.focus}`,
    );
  }
  await runSteps(page, p.tap, capture);
  result[p.name].push({ errors });
  if (errors.length) console.log(ENGINE, p.name, "errors", errors);
  await context.close();
}
await browser.close();
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/probe-${ENGINE}.json`, JSON.stringify(result, null, 1));
