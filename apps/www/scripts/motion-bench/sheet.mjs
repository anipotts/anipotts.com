// Contact sheets from record.mjs frames: one image per profile and step with
// times relative to the click or tap, so the choreography can be read frame
// by frame. Usage: RUN=/tmp/bench/r1/pr OUT=/tmp/bench/sheets LABEL=pr node sheet.mjs
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { chromium, option, STEPS } from "./common.mjs";

const RUN = option("RUN");
const OUT = option("OUT");
const LABEL = option("LABEL", "run");
const FROM = Number(option("FROM", "-40"));
const TO = Number(option("TO", "900"));
const LIMIT = Number(option("LIMIT", "40"));
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
for (const [profile, cols, cell] of [
  ["desktop-1280", 6, 300],
  ["mobile-390-4x", 10, 150],
]) {
  const summary = JSON.parse(
    readFileSync(`${RUN}/${profile}/summary.json`, "utf8"),
  );
  for (const step of STEPS) {
    const stat = summary[profile].find((s) => s.label === step);
    const dir = `${RUN}/${profile}/${profile}/${step}`;
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".jpg"))
      .sort();
    const window = files
      .map((file, i) => [file, stat.frameRel[i]])
      .filter(([, t]) => t >= FROM && t <= TO);
    const every = Math.ceil(window.length / LIMIT);
    const pick = window.filter((_, i) => i % every === 0);
    const figures = pick
      .map(([file, t]) => {
        const data = readFileSync(`${dir}/${file}`).toString("base64");
        return `<figure><img src="data:image/jpeg;base64,${data}"><figcaption>${t >= 0 ? "+" : ""}${t} ms</figcaption></figure>`;
      })
      .join("");
    const title = `${LABEL} ${profile} ${step}: first motion ${stat.clickToFirstMotionMs} ms, settled ${stat.clickToSettledMs} ms, ${window.length} frames between ${FROM} and ${TO} ms${every > 1 ? `, every ${every}` : ""}`;
    await page.setContent(
      `<style>body{margin:0;background:#1e1e1e;color:#ddd;font:12px monospace}h1{font-size:12px;margin:6px}main{display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:6px;padding:6px}figure{margin:0}img{width:${cell}px;display:block;border:1px solid #555}figcaption{text-align:center}</style><h1>${title}</h1><main>${figures}</main>`,
    );
    const height = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewportSize({
      width: cols * (cell + 6) + 12,
      height: Math.min(height, 6000),
    });
    const path = `${OUT}/sheet-${LABEL}-${profile}-${step}.png`;
    await page.screenshot({ path, fullPage: true });
    console.log(path);
  }
}
await browser.close();
