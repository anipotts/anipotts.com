// Edge cases around the choreography, each reported as observed state:
// height-only resize mid-flight, animations that never finish, reduced
// motion, light theme focus, the exit to a non-writing page, a second
// navigation mid-flight and a hidden tab. Usage:
//   BASE=http://127.0.0.1:8860 OUT=/tmp/bench/checks node checks.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, devices, option } from "./common.mjs";

const BASE = option("BASE");
const OUT = option("OUT");
const browser = await chromium.launch({ headless: true });
const report = {};
const state = (page) =>
  page.evaluate(() => {
    const active = document.activeElement;
    const body = document.querySelector(".article-body");
    return {
      url: location.pathname,
      flag: document.documentElement.dataset.writingTransition ?? null,
      overlays: document.querySelectorAll(
        ".writing-transition-surface,.writing-transition-word,.writing-transition-ghost,.writing-transition-slide",
      ).length,
      hidden: [...document.querySelectorAll("body *")].filter(
        (el) => el.style.visibility === "hidden",
      ).length,
      animations: document.getAnimations().length,
      h1Visible: document.querySelector("main h1")
        ? getComputedStyle(document.querySelector("main h1")).visibility
        : null,
      bodyOpacity: body ? getComputedStyle(body).opacity : null,
      focus: active
        ? `${active.tagName.toLowerCase()} ${active.getAttribute("href") || active.className || ""}`.trim()
        : null,
    };
  });
async function session(name, options, run) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: "dark",
    ...options,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const theme = options.colorScheme || "dark";
  await page.goto(`${BASE}/writing?theme=${theme}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(900);
  report[name] = { ...(await run(page, context)), errors };
  console.log(name, JSON.stringify(report[name]));
  await context.close();
}

// m50: a phone toolbar collapsing changes only the height.
await session(
  "height-resize-mid-open",
  { ...devices["iPhone 13"] },
  async (page) => {
    await page.tap("a.writing-card");
    await page.waitForFunction(
      () => document.documentElement.dataset.writingTransition,
    );
    await page.setViewportSize({ width: 390, height: 780 });
    await page.waitForTimeout(60);
    const during = await state(page);
    await page.waitForTimeout(1200);
    return { during, after: await state(page) };
  },
);
// A width change does abort, and the page still ends clean.
await session("width-resize-mid-open", {}, async (page) => {
  await page.click("a.writing-card");
  await page.waitForFunction(
    () => document.documentElement.dataset.writingTransition,
  );
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.waitForTimeout(60);
  return {
    during: await state(page),
    after: (await page.waitForTimeout(900), await state(page)),
  };
});
// m93: animations that never finish still hand the page back.
await session("stalled-animations", {}, async (page) => {
  await page.evaluate(() =>
    document.addEventListener(
      "astro:after-swap",
      () =>
        setTimeout(() => document.getAnimations().forEach((a) => a.pause()), 0),
      { once: true },
    ),
  );
  await page.click("a.writing-card");
  await page.waitForTimeout(300);
  const during = await state(page);
  await page.waitForTimeout(1200);
  return { during, after: await state(page) };
});
// Reduced motion and light theme: instant swap, same focus targets.
for (const [name, options] of [
  ["reduced-motion", { reducedMotion: "reduce" }],
  ["light-theme", { colorScheme: "light" }],
]) {
  await session(name, options, async (page) => {
    await page.click("a.writing-card");
    await page.waitForTimeout(80);
    const open = await state(page);
    await page.waitForTimeout(500);
    await page.click(".back");
    await page.waitForTimeout(500);
    return { open, close: await state(page) };
  });
}
// Article to a non-writing page keeps the exit path.
await session("exit-to-work", {}, async (page) => {
  await page.click("a.writing-card");
  await page.waitForTimeout(1000);
  await page.click('a.nav-link[href="/work"]');
  await page.waitForTimeout(120);
  const during = await state(page);
  await page.waitForTimeout(1000);
  return { during, after: await state(page) };
});
// A second navigation mid-flight: history back 150 ms into the open.
await session("back-mid-open", {}, async (page) => {
  await page.click("a.writing-card");
  await page.waitForTimeout(150);
  await page.goBack();
  await page.waitForTimeout(1200);
  return { after: await state(page) };
});
// Tab hidden mid-flight and shown again two seconds later.
await session("hidden-tab-mid-open", {}, async (page) => {
  await page.click("a.writing-card");
  await page.waitForTimeout(100);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await cdp.send("Page.setWebLifecycleState", { state: "frozen" });
  await new Promise((r) => setTimeout(r, 2000));
  await cdp.send("Page.setWebLifecycleState", { state: "active" });
  await page.waitForTimeout(800);
  return { after: await state(page) };
});
await browser.close();
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/checks.json`, JSON.stringify(report, null, 1));
