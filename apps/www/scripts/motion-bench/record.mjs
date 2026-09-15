// Records the four writing card steps on one build: a screencast with a
// per-frame pixel diff (click to first motion, click to settled, presented
// gaps), requestAnimationFrame timestamps and long tasks, all on one epoch
// clock. Usage:
//   BASE=http://127.0.0.1:8860 OUT=/tmp/bench/pr PROFILE=desktop-1280 node record.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, option, profiles, runSteps } from "./common.mjs";

const BASE = option("BASE");
const OUT = option("OUT");
const THEME = option("THEME", "dark");
const ONLY = option("PROFILE", "");
const FRAMES = option("FRAMES", "1") === "1";
const summary = { base: BASE, theme: THEME };
const browser = await chromium.launch({ headless: true });
// A second page decodes and diffs frames so the measured page stays clean.
const diffPage = await browser.newPage();
async function diffs(frames) {
  return diffPage.evaluate(async (frames) => {
    const load = (data) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = "data:image/jpeg;base64," + data;
      });
    const imgs = [];
    for (const f of frames) imgs.push(await load(f));
    const { width: w, height: h } = imgs[0];
    const ctx = document
      .createElement("canvas")
      .getContext("2d", { willReadFrequently: true });
    ctx.canvas.width = w;
    ctx.canvas.height = h;
    const px = imgs.map((img) => {
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, w, h).data;
    });
    const mean = (a, b) => {
      let s = 0;
      for (let i = 0; i < a.length; i += 4)
        s +=
          Math.abs(a[i] - b[i]) +
          Math.abs(a[i + 1] - b[i + 1]) +
          Math.abs(a[i + 2] - b[i + 2]);
      return s / (a.length / 4) / 3;
    };
    return {
      fromFirst: px.map((p) => +mean(px[0], p).toFixed(2)),
      fromLast: px.map((p) => +mean(px[px.length - 1], p).toFixed(2)),
    };
  }, frames);
}

for (const p of profiles(THEME)) {
  if (ONLY && p.name !== ONLY) continue;
  const context = await browser.newContext(p.context);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: p.cpu });
  await page.goto(`${BASE}/writing?theme=${THEME}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(1200);
  const theme = await page.evaluate(
    () => document.documentElement.dataset.theme,
  );
  summary[p.name] = [];
  async function capture(label, selector, action) {
    const dir = `${OUT}/${p.name}/${label}`;
    mkdirSync(dir, { recursive: true });
    const frames = [];
    const onFrame = async (event) => {
      frames.push({ t: event.metadata.timestamp * 1000, data: event.data });
      await cdp
        .send("Page.screencastFrameAck", { sessionId: event.sessionId })
        .catch(() => {});
    };
    // Settle hover first so the card's hover tint is not read as motion.
    if (!p.tap && selector) {
      await page.hover(selector);
      await page.waitForTimeout(350);
    }
    cdp.on("Page.screencastFrame", onFrame);
    await page.evaluate(() => {
      const epoch = (t) => +(performance.timeOrigin + t).toFixed(1);
      Object.assign(window, {
        __raf: [],
        __long: [],
        __click: 0,
        __events: [],
      });
      const start = performance.now();
      const tick = (t) => {
        window.__raf.push(epoch(t));
        if (t - start < 2000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      const mark = () => {
        if (!window.__click) window.__click = epoch(performance.now());
      };
      for (const type of ["pointerdown", "touchstart", "click"])
        addEventListener(type, mark, { capture: true, once: true });
      for (const name of [
        "astro:before-preparation",
        "astro:before-swap",
        "astro:after-swap",
        "astro:page-load",
        "writing:transition-end",
      ])
        document.addEventListener(
          name,
          () => window.__events.push([name, epoch(performance.now())]),
          { once: true },
        );
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            window.__long.push({ start: epoch(e.startTime), dur: e.duration });
        }).observe({ type: "longtask", buffered: false });
      } catch {}
    });
    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 70,
      maxWidth: 800,
      maxHeight: 900,
      everyNthFrame: 1,
    });
    await page.waitForTimeout(150);
    await action();
    await page.waitForTimeout(1500);
    await cdp.send("Page.stopScreencast");
    cdp.off("Page.screencastFrame", onFrame);
    const timing = await page.evaluate(() => ({
      raf: window.__raf,
      long: window.__long,
      click: window.__click,
      events: window.__events,
      url: location.pathname,
      overlays: document.querySelectorAll(
        ".writing-transition-surface,.writing-transition-word,.writing-transition-ghost",
      ).length,
    }));
    const base = frames.length ? frames[0].t : 0;
    if (FRAMES)
      frames.forEach((f, i) =>
        writeFileSync(
          `${dir}/f${String(i).padStart(3, "0")}-${Math.round(f.t - base)}ms.jpg`,
          Buffer.from(f.data, "base64"),
        ),
      );
    const { fromFirst, fromLast } = await diffs(frames.map((f) => f.data));
    // A history traversal has no click; time it from the router's first event.
    const click = timing.click || timing.events[0]?.[1] || frames[0]?.t || 0;
    const rel = frames.map((f) => +(f.t - click).toFixed(0));
    const first = frames.findIndex(
      (f, i) => f.t >= click && fromFirst[i] > 1.0,
    );
    let last = frames.length - 1;
    while (last > 0 && fromLast[last - 1] <= 0.6) last--;
    const stat = {
      label,
      frames: frames.length,
      clickEpoch: click,
      events: timing.events.map(([n, t]) => [n, +(t - click).toFixed(0)]),
      clickToFirstMotionMs: first >= 0 ? rel[first] : null,
      clickToSettledMs: rel[last],
      rafRel: timing.raf.map((t) => +(t - click).toFixed(1)),
      // Observers from earlier steps share the realm; count each task once.
      longTasks: [
        ...new Map(timing.long.map((l) => [l.start, l])).values(),
      ].map((l) => ({
        atMs: +(l.start - click).toFixed(0),
        dur: l.dur,
      })),
      endUrl: timing.url,
      overlaysLeft: timing.overlays,
      frameRel: rel,
      diffFromFirst: fromFirst,
    };
    summary[p.name].push(stat);
    console.log(
      p.name,
      label,
      `first ${stat.clickToFirstMotionMs} settled ${stat.clickToSettledMs} frames ${stat.frames} long ${stat.longTasks.length}`,
    );
  }
  await runSteps(page, p.tap, capture);
  summary[p.name].push({ theme });
  await context.close();
}
await browser.close();
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 1));
