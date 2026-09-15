// CPU profile of the open and close taps, aggregated by function, to
// attribute any long task at the swap. Usage:
//   BASE=http://127.0.0.1:8860 OUT=/tmp/bench/profile node profile.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, option, profiles } from "./common.mjs";

const BASE = option("BASE");
const OUT = option("OUT");
mkdirSync(OUT, { recursive: true });
function aggregate(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes)
    for (const c of n.children || []) parent.set(c, n.id);
  const name = (n) => {
    const f = n.callFrame;
    return `${f.functionName || "(anonymous)"} ${f.url.split("/").pop()}:${f.lineNumber + 1}`;
  };
  const self = new Map();
  const inclusive = new Map();
  profile.samples.forEach((id, i) => {
    const ms = (profile.timeDeltas[i] || 0) / 1000;
    const key = name(byId.get(id));
    self.set(key, (self.get(key) || 0) + ms);
    const seen = new Set();
    for (let at = id; at !== undefined; at = parent.get(at)) {
      const k = name(byId.get(at));
      if (seen.has(k)) continue;
      seen.add(k);
      inclusive.set(k, (inclusive.get(k) || 0) + ms);
    }
  });
  const top = (m) =>
    [...m]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([k, v]) => `${v.toFixed(1)}ms ${k}`);
  return { self: top(self), inclusive: top(inclusive) };
}
const browser = await chromium.launch({ headless: true });
const report = {};
for (const p of profiles("dark")) {
  const context = await browser.newContext(p.context);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: p.cpu });
  await page.goto(`${BASE}/writing?theme=dark`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  const act = (selector) => (p.tap ? page.tap(selector) : page.click(selector));
  for (const [label, selector] of [
    ["expand", "a.writing-card"],
    ["collapse", ".back"],
  ]) {
    await cdp.send("Profiler.start");
    await act(selector);
    await page.waitForTimeout(1300);
    const { profile } = await cdp.send("Profiler.stop");
    writeFileSync(
      `${OUT}/profile-${p.name}-${label}.cpuprofile`,
      JSON.stringify(profile),
    );
    report[`${p.name} ${label}`] = aggregate(profile);
    await page.waitForTimeout(600);
  }
  await context.close();
}
await browser.close();
writeFileSync(`${OUT}/profile.json`, JSON.stringify(report, null, 1));
for (const [key, value] of Object.entries(report))
  console.log(`\n## ${key}\n${value.inclusive.slice(0, 12).join("\n")}`);
