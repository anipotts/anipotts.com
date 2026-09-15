// Per-frame collision probe for the writing card choreography. On every
// animation frame of each step it records:
// - pairs of text layers (transition overlays and the live headings, summaries
//   and dates they stand in for) that intersect while both sit above 0.3
//   opacity and are not hidden under the opaque surface;
// - frames where the wave wrapper box leaves the surface clip box;
// - frames where a visible morph layer carries a straight horizontal edge
//   (10 or more neighbouring columns inside the canvas within half a unit);
// and after the step settles: overlays left, inline-hidden elements, running
// animations, the transition flag and where focus landed.
// Usage: BASE=http://127.0.0.1:8860 OUT=/tmp/bench/probe node probe.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, option, profiles, runSteps, webkit } from "./common.mjs";

const BASE = option("BASE");
const OUT = option("OUT");
const THEME = option("THEME", "dark");
// ENGINE=webkit runs the same probe in WebKit, without CPU throttling.
const ENGINE = option("ENGINE", "chromium");
const result = { base: BASE, theme: THEME, engine: ENGINE };

function install() {
  const texts = [
    "[data-writing-article] > header h1",
    "[data-writing-article] > header .summary",
    "[data-writing-article] > header time",
    "main .page-hero__title",
    "main .page-hero__summary",
    "main a.writing-card .title",
    "main a.writing-card .sub",
    "main a.writing-card time",
  ];
  const probe = {
    frames: 0,
    animated: 0,
    collisions: [],
    outside: [],
    flat: [],
    start: performance.now(),
  };
  window.__probe = probe;
  let watched = null;
  const opacity = (el) => {
    if (getComputedStyle(el).visibility !== "visible") return 0;
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement)
      o *= Number(getComputedStyle(n).opacity);
    return o;
  };
  const insetBox = (value) => {
    const m = /inset\(([^)]*?)(?:\s+round[^)]*)?\)/.exec(value || "");
    if (!m) return null;
    const v = m[1].trim().split(/\s+/).map(parseFloat);
    const [t, r = t, b = t, l = r] = v;
    return { left: l, top: t, right: innerWidth - r, bottom: innerHeight - b };
  };
  const overlap = (a, b) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  const inside = (a, clip) =>
    a.left >= clip.left - 0.5 &&
    a.top >= clip.top - 0.5 &&
    a.right <= clip.right + 0.5 &&
    a.bottom <= clip.bottom + 0.5;
  const tick = () => {
    const t = +(performance.now() - probe.start).toFixed(0);
    probe.frames++;
    const surface = document.querySelector(".writing-transition-surface");
    const clip = surface && insetBox(getComputedStyle(surface).clipPath);
    const main = document.querySelector("main");
    const mainAbove = main && Number(getComputedStyle(main).zIndex) > 200;
    if (document.documentElement.dataset.writingTransition) probe.animated++;
    const wrapper = document.querySelector(".writing-transition-waves");
    // The wrapper's transform is written on the surface clock inside the
    // page's own frame callback, which can run after this one: compare it
    // with the clip in the same frame, as soon as it is written.
    if (wrapper && wrapper !== watched) {
      watched = wrapper;
      const check = () => {
        const s = document.querySelector(".writing-transition-surface");
        const c = s && insetBox(getComputedStyle(s).clipPath);
        if (!c || !wrapper.isConnected) return;
        const w = wrapper.getBoundingClientRect();
        if (!inside(w, c))
          probe.outside.push({
            t: +(performance.now() - probe.start).toFixed(0),
            wrapper: [w.left, w.top, w.right, w.bottom].map(
              (v) => +v.toFixed(1),
            ),
            clip: [c.left, c.top, c.right, c.bottom].map((v) => +v.toFixed(1)),
          });
      };
      new MutationObserver(check).observe(wrapper, {
        attributes: true,
        attributeFilter: ["style"],
      });
      check();
    }
    wrapper?.querySelectorAll("path").forEach((path, index) => {
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
        for (let i = 0; i < ys.length; i++)
          for (let j = i; j < ys.length; j++) {
            const part = ys.slice(i, j + 1);
            if (!part.every((y) => y > 0 && y < 800)) break;
            if (Math.max(...part) - Math.min(...part) >= 0.5) break;
            longest = Math.max(longest, part.length);
          }
        if (longest >= 10) {
          probe.flat.push({ t, layer: index, columns: longest });
          break;
        }
      }
    });
    const layers = [];
    document.querySelectorAll(".writing-transition-word").forEach((el) =>
      layers.push({
        name: el.dataset.layer,
        overlay: true,
        r: el.getBoundingClientRect(),
        o: opacity(el),
      }),
    );
    texts.forEach((selector) =>
      document.querySelectorAll(selector).forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight || !r.width) return;
        layers.push({
          name: `${selector}#${i}`,
          overlay: false,
          r,
          o: opacity(el),
          under: !mainAbove,
        });
      }),
    );
    const visible = layers.filter((l) => l.o > 0.3);
    for (let i = 0; i < visible.length; i++)
      for (let j = i + 1; j < visible.length; j++) {
        const a = visible[i];
        const b = visible[j];
        if (!a.overlay && !b.overlay) continue;
        if (!overlap(a.r, b.r)) continue;
        const live = a.overlay ? b : a;
        if (!live.overlay && live.under && surface && clip) {
          const cross = {
            left: Math.max(a.r.left, b.r.left),
            top: Math.max(a.r.top, b.r.top),
            right: Math.min(a.r.right, b.r.right),
            bottom: Math.min(a.r.bottom, b.r.bottom),
          };
          if (inside(cross, clip)) continue;
        }
        probe.collisions.push({
          t,
          a: a.name,
          b: b.name,
          oa: +a.o.toFixed(2),
          ob: +b.o.toFixed(2),
        });
      }
    if (performance.now() - probe.start < 1400) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const browser = await (ENGINE === "webkit" ? webkit : chromium).launch({
  headless: true,
});
for (const p of profiles(THEME)) {
  const context = await browser.newContext(p.context);
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
    await page.waitForTimeout(1600);
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
      outsideFrames: probe.outside.length,
      flatEdgeFrames: new Set(probe.flat.map((f) => f.t)).size,
      flat: probe.flat.slice(0, 20),
      collisions: probe.collisions.slice(0, 20),
      outside: probe.outside.slice(0, 20),
      after,
    };
    result[p.name].push(row);
    console.log(
      p.name,
      label,
      `frames ${row.frames} animated ${row.animatedFrames} collisions ${row.collisionFrames} outside ${row.outsideFrames} flat ${row.flatEdgeFrames} overlays ${after.overlays} hidden ${after.hidden} running ${after.running} focus ${after.focus}`,
    );
  }
  await runSteps(page, p.tap, capture);
  result[p.name].push({ errors });
  await context.close();
}
await browser.close();
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/probe.json`, JSON.stringify(result, null, 1));
