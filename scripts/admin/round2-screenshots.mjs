#!/usr/bin/env node
// The round-2 PR screenshots, from a running admin dev server.
//
//   node scripts/admin/round2-screenshots.mjs --base http://127.0.0.1:4583
//     [--out docs/design/screenshots/admin-round2] [--only overview,obs-status]
//     [--setups 1280,393] [--playwright /path/to/playwright] [--quantize]
//
// Every page is shot with `?fixture=synthetic`, the committed samples. A
// page that carries the Replay mark (a local replay of System's live
// payloads, apps/admin/.local/replay) is refused, and every shot is stamped
// "synthetic" (scripts/admin/screenshot-origin.mjs), which the fixture
// boundary check requires of each committed screenshot.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withOrigin } from "./screenshot-origin.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const flags = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith("--")) continue;
  const next = process.argv[index + 1];
  const value = next && !next.startsWith("--") ? next : "true";
  flags.set(arg.slice(2), value);
  if (value !== "true") index += 1;
}
const BASE = flags.get("base") ?? "http://127.0.0.1:4583";
const OUT = resolve(
  ROOT,
  flags.get("out") ?? "docs/design/screenshots/admin-round2",
);
const only = flags.get("only")?.split(",");
const setupKeys = flags.get("setups")?.split(",") ?? ["1280", "393"];
const playwright = flags.has("playwright")
  ? createRequire(import.meta.url)(flags.get("playwright"))
  : createRequire(join(ROOT, "apps/admin/package.json"))("@playwright/test");

const data = JSON.parse(
  readFileSync(
    join(ROOT, "apps/admin/src/fixtures/data_v1.synthetic.json"),
    "utf8",
  ),
);
const record = data.records.find((item) => item.kind === "browsing_day");
const PAGES = [
  ["overview", "/"],
  ["data-records", "/data/records"],
  ["data-record", `/data/records/${record.record_id}`],
  ["data-sources", "/data/sources"],
  ["data-health", "/data/health"],
  ["data-knowledge", "/data/knowledge"],
  ["obs-status", "/observability/status"],
  ["obs-status-entry", "/observability/status?entry=pc.writer"],
  ["obs-activity", "/observability/activity"],
  ["obs-alerts", "/observability/alerts"],
  ["content-library", "/content/writing"],
].filter(([key]) => !only || only.includes(key));
const SETUPS = [
  {
    key: "1280",
    engine: "chromium",
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  },
  {
    key: "393",
    engine: "webkit",
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  {
    key: "768",
    engine: "chromium",
    viewport: { width: 768, height: 1024 },
    deviceScaleFactor: 1,
  },
].filter((setup) => setupKeys.includes(setup.key));

const synthetic = (path) => {
  const url = new URL(path, BASE);
  url.searchParams.set("fixture", "synthetic");
  return url.href;
};

mkdirSync(OUT, { recursive: true });
const written = [];
for (const setup of SETUPS) {
  const browser = await playwright[setup.engine].launch({ headless: true });
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({
      viewport: setup.viewport,
      deviceScaleFactor: setup.deviceScaleFactor,
      isMobile: setup.isMobile,
      hasTouch: setup.hasTouch,
      colorScheme: theme,
    });
    await context.addCookies([{ name: "ap-theme", value: theme, url: BASE }]);
    const page = await context.newPage();
    for (const [key, path] of PAGES) {
      const response = await page.goto(synthetic(path), {
        waitUntil: "networkidle",
      });
      if (response?.status() !== 200)
        throw new Error(`${key}: HTTP ${response?.status()}`);
      await page.addStyleTag({
        content: "astro-dev-toolbar{display:none!important}",
      });
      await page.waitForTimeout(600);
      if (await page.$('[data-fixture="replay"]'))
        throw new Error(
          `${key}: the page carries the Replay mark; a replay of live payloads is never committed`,
        );
      const file = join(OUT, `${key}-${setup.key}-${theme}.png`);
      writeFileSync(file, await page.screenshot({ fullPage: false }));
      if (flags.has("quantize"))
        execFileSync("pngquant", [
          "--force",
          "--ext",
          ".png",
          "--quality",
          "70-95",
          file,
        ]);
      writeFileSync(file, withOrigin(readFileSync(file), "synthetic"));
      written.push(file);
    }
    await context.close();
  }
  await browser.close();
}
console.log(`${written.length} screenshots, each stamped synthetic`);
