#!/usr/bin/env node

// Browser contrast check for AdminLayout pages in the three theme modes.
//
//   pnpm --filter @anipotts/admin test:theme-render [base-url] [options]
//   node scripts/admin/theme-contrast.mjs [base-url] [options]
//
// base-url defaults to the Admin URL that `pnpm dev:admin` recorded for this
// worktree, then to the managed preview at http://localhost:4311.
//
// Options:
//   --only /inbox,/work       limit routes
//   --modes system-dark,...   limit modes
//   --widths 390,1280         viewport widths (default 1280)
//   --concurrency 2           parallel page loads
//   --browser webkit          chromium (default) or webkit
//   --json <file>             write the full result
//   --snapshot-out <file>     record color, background-color and
//                             border-top-color of visible elements
//   --snapshot-compare <file> fail when those computed colors changed or
//                             an element was added or removed
//   --shots <dir>             save full-page screenshots
//
// A run fails on a contrast failure, a load problem (including a load that
// checked no text), an allowlist entry that matched nothing, or a snapshot
// difference.
//
// Page loads are GET only. The check never clicks, types or records text.

import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ADMIN_ROUTES } from "../ci/admin-route-inventory.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const playwright = createRequire(join(ROOT, "apps/admin/package.json"))(
  "@playwright/test",
);

const MODES = [
  // The default preference on a dark OS: no cookie, no query.
  { name: "system-dark", colorScheme: "dark", theme: null },
  { name: "explicit-dark", colorScheme: "light", theme: "dark" },
  { name: "explicit-light", colorScheme: "dark", theme: "light" },
];
const HEIGHTS = { 390: 844, 768: 1024, 1280: 900 };

// Known failures that a later slice fixes. Each entry names one element.
const ALLOWLIST = [
  {
    route: "/inbox",
    selector:
      "header.activation-focus > button.semantic-reference.is-action > span",
  },
];

// The dev preview allowance in apps/admin/src/lib/admin-access-policy.ts does
// not list these, so they redirect to /auth without a session.
const DEV_PREVIEW_DENIED = new Set(["/ops/destructive"]);

const args = process.argv.slice(2);
const flags = new Map();
const positional = [];
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--") continue;
  if (arg.startsWith("--")) flags.set(arg.slice(2), args[++index]);
  else positional.push(arg);
}
const list = (name) => flags.get(name)?.split(",").filter(Boolean);

function defaultBaseUrl() {
  try {
    const metadata = JSON.parse(
      readFileSync(join(ROOT, ".local/dev-servers/processes.json"), "utf8"),
    );
    const admin = metadata.apps?.find((app) => app.key === "admin");
    if (admin?.url) return admin.url;
  } catch {
    // No managed preview for this worktree.
  }
  return "http://localhost:4311";
}

const BASE = positional[0] ?? defaultBaseUrl();
const WIDTHS = (list("widths") ?? ["1280"]).map(Number);
const CONCURRENCY = Math.max(1, Number(flags.get("concurrency") ?? 2));
const modeNames = list("modes");
const modes = modeNames
  ? MODES.filter((mode) => modeNames.includes(mode.name))
  : MODES;
const BROWSER = flags.get("browser") ?? "chromium";
if (!["chromium", "webkit"].includes(BROWSER)) {
  console.error(`--browser must be chromium or webkit, received ${BROWSER}`);
  process.exit(2);
}

// ---------------------------------------------------------------- routes

function usesAdminLayout(file, seen = new Set()) {
  const abs = resolve(ROOT, file);
  if (seen.has(abs) || !abs.endsWith(".astro") || !existsSync(abs)) {
    return false;
  }
  seen.add(abs);
  const source = readFileSync(abs, "utf8");
  if (/layouts\/AdminLayout\.astro["']/.test(source)) return true;
  if (/layouts\/\w+\.astro["']/.test(source)) return false;
  for (const match of source.matchAll(
    /from\s+["'](\.{1,2}\/[^"']+\.astro)["']/g,
  )) {
    const component = relative(ROOT, resolve(dirname(abs), match[1]));
    if (usesAdminLayout(component, seen)) return true;
  }
  return false;
}

const only = list("only");
const routes = ADMIN_ROUTES.filter(
  ({ route, file }) =>
    file.endsWith(".astro") &&
    !/(^|\/)logout$/.test(route) &&
    usesAdminLayout(file) &&
    (!only || only.includes(route)),
).map(({ route }) => route);

// Follows same-path redirects so the page is requested at its final URL.
// A redirect such as /work -> /work?view=now would otherwise drop ?theme.
async function resolveTarget(route) {
  let path = route;
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(new URL(path, BASE), {
      redirect: "manual",
      signal: AbortSignal.timeout(180_000),
    });
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403) {
      return { denied: true };
    }
    if (response.status >= 300 && response.status < 400) {
      const next = new URL(response.headers.get("location") ?? "/", BASE);
      if (next.pathname === "/auth") return { denied: true };
      if (next.pathname !== new URL(path, BASE).pathname) {
        return { error: `redirects to ${next.pathname}` };
      }
      path = `${next.pathname}${next.search}`;
      continue;
    }
    if (response.status >= 400) return { error: `HTTP ${response.status}` };
    return { path };
  }
  return { error: "too many redirects" };
}

// ---------------------------------------------------------------- in page

// Runs inside the page. Returns selectors, colors and counts, never text.
function measure({ allowSelectors, snapshot }) {
  const SKIP_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEMPLATE",
    "TITLE",
    "HEAD",
    "META",
    "LINK",
    "OPTION",
    "OPTGROUP",
    "DATALIST",
  ]);
  const STYLEX = /^x[a-z0-9]{5,8}$/;

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const colorCache = new Map();
  function parseColor(value) {
    if (colorCache.has(value)) return colorCache.get(value);
    let out;
    const rgb = value.match(
      /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/,
    );
    if (rgb) {
      const alpha =
        rgb[4] === undefined
          ? 1
          : rgb[4].endsWith("%")
            ? parseFloat(rgb[4]) / 100
            : parseFloat(rgb[4]);
      out = { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: alpha };
    } else {
      // Canvas resolves color(), oklch() and color-mix() output.
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      out = { r, g, b, a: a / 255 };
    }
    colorCache.set(value, out);
    return out;
  }
  const over = (top, bottom) => {
    const a = top.a + bottom.a * (1 - top.a);
    if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
    const channel = (key) =>
      (top[key] * top.a + bottom[key] * bottom.a * (1 - top.a)) / a;
    return { r: channel("r"), g: channel("g"), b: channel("b"), a };
  };
  const luminance = (color) => {
    const linear = (value) => {
      const v = value / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return (
      0.2126 * linear(color.r) +
      0.7152 * linear(color.g) +
      0.0722 * linear(color.b)
    );
  };
  const contrast = (a, b) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  };
  const format = (color) =>
    `rgb(${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)})`;

  // The browser canvas shows through when no ancestor paints a background.
  const root = document.documentElement;
  const rootStyle = getComputedStyle(root);
  const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const schemes = rootStyle.colorScheme.split(/\s+/);
  const canvasDark =
    schemes.includes("dark") &&
    (!schemes.includes("light") || prefersDark || schemes.includes("only"));
  const CANVAS = canvasDark
    ? { r: 18, g: 18, b: 18, a: 1 }
    : { r: 255, g: 255, b: 255, a: 1 };

  const styleCache = new Map();
  const style = (el) => {
    let value = styleCache.get(el);
    if (!value) {
      value = getComputedStyle(el);
      styleCache.set(el, value);
    }
    return value;
  };
  const parentOf = (el) =>
    el.parentElement ??
    (el.parentNode instanceof ShadowRoot ? el.parentNode.host : null);

  function hidden(el) {
    let opacity = 1;
    for (let node = el; node; node = parentOf(node)) {
      const s = style(node);
      if (s.display === "none") return true;
      opacity *= parseFloat(s.opacity);
      if (
        s.clip &&
        s.clip !== "auto" &&
        /rect\(\s*0(px)?[,\s]+0(px)?[,\s]+0(px)?[,\s]+0(px)?\s*\)/.test(s.clip)
      ) {
        return true;
      }
      if (s.clipPath === "inset(50%)") return true;
      if (s.overflow !== "visible" && node !== root && node !== document.body) {
        const box = node.getBoundingClientRect();
        if (box.width <= 1 || box.height <= 1) return true;
      }
    }
    return opacity < 0.02;
  }

  function selectorOf(el) {
    const parts = [];
    for (
      let node = el, depth = 0;
      node && node.nodeType === 1 && depth < 4;
      node = parentOf(node), depth++
    ) {
      if (node === document.body || node === root) break;
      let part = node.tagName.toLowerCase();
      // Ids can carry record slugs, so repeated or long ids are redacted.
      if (node.id) {
        const repeated = [...(node.parentElement?.children ?? [])].some(
          (sibling) =>
            sibling !== node &&
            sibling.tagName === node.tagName &&
            sibling.className === node.className,
        );
        part +=
          repeated || /\d/.test(node.id) || node.id.length > 32
            ? "#[data-id]"
            : `#${node.id}`;
      }
      const classes = [...node.classList]
        .filter((name) => !STYLEX.test(name))
        .slice(0, 2);
      if (classes.length) part += classes.map((name) => `.${name}`).join("");
      else if (node.getAttribute("role")) {
        part += `[role=${node.getAttribute("role")}]`;
      }
      parts.unshift(part);
    }
    return parts.join(" > ");
  }

  const elements = [...document.querySelectorAll("body *")];
  const failures = [];
  let checked = 0;
  let overImage = 0;
  let disabled = 0;
  for (const el of elements) {
    if (SKIP_TAGS.has(el.tagName) || el.closest("svg")) continue;
    const textNodes = [...el.childNodes].filter(
      (node) => node.nodeType === 3 && node.nodeValue.trim().length > 0,
    );
    if (!textNodes.length) continue;
    const s = style(el);
    if (s.visibility !== "visible") continue;
    let area = 0;
    for (const node of textNodes) {
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        area += rect.width * rect.height;
      }
    }
    if (area < 4 || hidden(el)) continue;
    if (el.closest(":disabled, [aria-disabled='true']")) {
      disabled++;
      continue;
    }

    // Composite ancestor backgrounds down to the first opaque one.
    const chain = [];
    let base = -1;
    let image = false;
    for (let node = el; node; node = parentOf(node)) {
      const ns = style(node);
      if (ns.backgroundImage && ns.backgroundImage !== "none") {
        image = true;
        break;
      }
      const background = parseColor(ns.backgroundColor);
      chain.push({ background, opacity: parseFloat(ns.opacity) });
      if (background.a >= 0.999) {
        base = chain.length - 1;
        break;
      }
    }
    if (image) {
      overImage++;
      continue;
    }
    const upto = base === -1 ? chain.length : base;
    let background = base === -1 ? CANVAS : { ...chain[base].background, a: 1 };
    const opacityBelow = new Array(upto + 1).fill(1);
    for (let i = upto - 1; i >= 0; i--) {
      opacityBelow[i] = opacityBelow[i + 1] * chain[i].opacity;
    }
    for (let i = upto - 1; i >= 0; i--) {
      const layer = chain[i].background;
      if (layer.a <= 0) continue;
      background = over({ ...layer, a: layer.a * opacityBelow[i] }, background);
    }
    background = { ...background, a: 1 };
    const fill =
      s.webkitTextFillColor && s.webkitTextFillColor !== s.color
        ? s.webkitTextFillColor
        : s.color;
    const raw = parseColor(fill);
    const foreground = over({ ...raw, a: raw.a * opacityBelow[0] }, background);
    const size = parseFloat(s.fontSize);
    const weight = parseInt(s.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const threshold = large ? 3 : 4.5;
    const ratio = contrast(foreground, background);
    checked++;
    if (ratio < threshold) {
      const allowedBy = allowSelectors.find((selector) => el.matches(selector));
      failures.push({
        selector: selectorOf(el),
        fg: format(foreground),
        bg: format(background),
        ratio: Math.round(ratio * 100) / 100,
        threshold,
        allowlisted: allowedBy !== undefined,
        allowedBy,
      });
    }
  }

  let colors = null;
  if (snapshot) {
    colors = {};
    const pathOf = (el) => {
      const parts = [];
      for (
        let node = el;
        node && node !== document.body;
        node = node.parentElement
      ) {
        const index = [...node.parentElement.children]
          .filter((sibling) => sibling.tagName === node.tagName)
          .indexOf(node);
        parts.unshift(`${node.tagName.toLowerCase()}:${index}`);
      }
      return parts.join("/");
    };
    for (const el of elements) {
      if (SKIP_TAGS.has(el.tagName)) continue;
      if (!el.checkVisibility({ visibilityProperty: true })) continue;
      const box = el.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) continue;
      const s = style(el);
      colors[pathOf(el)] = [s.color, s.backgroundColor, s.borderTopColor];
    }
  }

  return {
    dataTheme: root.getAttribute("data-theme"),
    colorScheme: rootStyle.colorScheme,
    checked,
    skipped: { overImage, disabled },
    failures,
    colors,
  };
}

// ---------------------------------------------------------------- runner

const slug = (route) => route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-");

async function evaluateWithRetry(page, payload) {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.waitForLoadState("load");
      return await page.evaluate(measure, payload);
    } catch (error) {
      // /inbox reloads itself when its poll sees new rows.
      if (attempt >= 2 || !/context was destroyed/i.test(String(error))) {
        throw error;
      }
    }
  }
}

async function runTask(browser, task) {
  const { route, path, mode, width } = task;
  const context = await browser.newContext({
    viewport: { width, height: HEIGHTS[width] ?? 900 },
    colorScheme: mode.colorScheme,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const result = { route, path, mode: mode.name, width, problems: [] };
  try {
    const url = new URL(path, BASE);
    if (mode.theme) url.searchParams.set("theme", mode.theme);
    const response = await page.goto(url.href, {
      waitUntil: "load",
      timeout: 180_000,
    });
    if (response?.request().redirectedFrom()) {
      result.problems.push(`redirected to ${new URL(page.url()).pathname}`);
    }
    if ((response?.status() ?? 0) >= 400) {
      result.problems.push(`HTTP ${response.status()}`);
    }
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});
    await page
      .waitForFunction(() => !document.querySelector("astro-island[ssr]"), {
        timeout: 30_000,
      })
      .catch(() => result.problems.push("islands did not hydrate"));
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page.waitForTimeout(750);

    const measured = await evaluateWithRetry(page, {
      allowSelectors: ALLOWLIST.filter((entry) => entry.route === route).map(
        (entry) => entry.selector,
      ),
      snapshot: Boolean(
        flags.get("snapshot-out") || flags.get("snapshot-compare"),
      ),
    });
    Object.assign(result, measured);
    // An empty, blank or unhydrated page must not pass with nothing checked.
    if (!measured.checked) result.problems.push("checked no text nodes");
    // A dropped ?theme must not pass as an explicit mode.
    if (measured.dataTheme !== mode.theme) {
      result.problems.push(
        `html data-theme is ${measured.dataTheme ?? "absent"}, expected ${mode.theme ?? "absent"}`,
      );
    }

    if (flags.get("shots")) {
      const dir = resolve(flags.get("shots"));
      mkdirSync(dir, { recursive: true });
      await page
        .addStyleTag({ content: "astro-dev-toolbar{display:none!important}" })
        .catch(() => {});
      // The shell scrolls inside an element, so grow the viewport to fit it.
      const height = await page.evaluate(() => {
        let extra = 0;
        for (const el of document.querySelectorAll("body *")) {
          if (!/(auto|scroll)/.test(getComputedStyle(el).overflowY)) continue;
          if (el.clientWidth <= window.innerWidth * 0.4) continue;
          extra = Math.max(extra, el.scrollHeight - el.clientHeight);
        }
        return Math.max(
          document.scrollingElement.scrollHeight,
          window.innerHeight + extra,
        );
      });
      const shotHeight = Math.min(Math.ceil(height), 16_000);
      if (shotHeight > (HEIGHTS[width] ?? 900)) {
        await page.setViewportSize({ width, height: shotHeight });
        await page.waitForTimeout(400);
      }
      result.screenshot = join(dir, `${slug(route)}-${mode.name}-${width}.png`);
      await page.screenshot({ path: result.screenshot, fullPage: true });
    }
  } catch (error) {
    result.problems.push(String(error.message ?? error).split("\n")[0]);
  }
  await context.close();
  return result;
}

const denied = [];
const unresolved = [];
const tasks = [];
for (const route of routes) {
  const target = await resolveTarget(route).catch((error) => ({
    error: String(error.message ?? error),
  }));
  if (target.denied) {
    denied.push(route);
    continue;
  }
  if (target.error) {
    unresolved.push(`${route}: ${target.error}`);
    continue;
  }
  for (const width of WIDTHS) {
    for (const mode of modes) {
      tasks.push({ route, path: target.path, mode, width });
    }
  }
}

const browser = await playwright[BROWSER].launch({ headless: true });
console.log(
  `theme contrast: ${BASE}, ${BROWSER} ${browser.version()}, ${tasks.length} loads, ${routes.length} AdminLayout routes, widths ${WIDTHS.join(",")}`,
);
const results = [];
const queue = [...tasks];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const result = await runTask(browser, queue.shift());
      results.push(result);
      const failing = result.failures?.filter((f) => !f.allowlisted).length;
      const allowed = result.failures?.filter((f) => f.allowlisted).length;
      console.log(
        `${result.path} ${result.mode}@${result.width} checked=${result.checked ?? "-"} failures=${failing ?? "-"}` +
          `${allowed ? ` allowlisted=${allowed}` : ""}` +
          `${result.problems.length ? ` PROBLEM ${result.problems.join("; ")}` : ""}`,
      );
    }
  }),
);
await browser.close();

const order = (r) => `${routes.indexOf(r.route)}`.padStart(3, "0");
results.sort(
  (a, b) =>
    order(a).localeCompare(order(b)) ||
    a.width - b.width ||
    modes.findIndex((m) => m.name === a.mode) -
      modes.findIndex((m) => m.name === b.mode),
);

let failed = tasks.length === 0;
console.log("\nsummary");
for (const width of WIDTHS) {
  for (const mode of modes) {
    const rows = results.filter(
      (r) => r.mode === mode.name && r.width === width,
    );
    const failing = rows.flatMap((r) =>
      (r.failures ?? []).filter((f) => !f.allowlisted).map(() => r.route),
    );
    const allowed = rows.reduce(
      (sum, r) => sum + (r.failures ?? []).filter((f) => f.allowlisted).length,
      0,
    );
    const problems = rows.filter((r) => r.problems.length).length;
    console.log(
      `${mode.name}@${width}: ${failing.length} failing text nodes on ${new Set(failing).size} routes, ${allowed} allowlisted, ${problems} load problems`,
    );
    if (failing.length || problems) failed = true;
  }
}
const grouped = new Map();
for (const result of results) {
  for (const failure of (result.failures ?? []).filter((f) => !f.allowlisted)) {
    const line = `${result.route} ${result.mode}@${result.width} ${failure.selector} ${failure.fg} on ${failure.bg} ${failure.ratio} < ${failure.threshold}`;
    grouped.set(line, (grouped.get(line) ?? 0) + 1);
  }
}
for (const [line, count] of grouped) {
  console.log(`  ${line}${count > 1 ? ` (x${count})` : ""}`);
}
// A fixed or renamed element leaves a stale entry that would hide a new
// failure on the same selector, so each entry must match at least once in
// any run that loads its route.
const allowlistUsed = new Set(
  results.flatMap((r) =>
    (r.failures ?? [])
      .filter((f) => f.allowlisted)
      .map((f) => `${r.route} ${f.allowedBy}`),
  ),
);
const loadedRoutes = new Set(tasks.map((task) => task.route));
for (const entry of ALLOWLIST) {
  if (
    loadedRoutes.has(entry.route) &&
    !allowlistUsed.has(`${entry.route} ${entry.selector}`)
  ) {
    console.log(
      `allowlist entry matched nothing: ${entry.route} ${entry.selector}`,
    );
    failed = true;
  }
}
if (denied.length) {
  console.log(
    `skipped, denied by the dev preview policy: ${denied.join(", ")}`,
  );
  const unexpected = denied.filter((route) => !DEV_PREVIEW_DENIED.has(route));
  if (unexpected.length) {
    console.log(`unexpected denials: ${unexpected.join(", ")}`);
    failed = true;
  }
}
if (unresolved.length) {
  console.log(`unresolved routes:\n  ${unresolved.join("\n  ")}`);
  failed = true;
}

const snapshot = Object.fromEntries(
  results
    .filter((r) => r.colors)
    .map((r) => [`${r.path} ${r.mode}@${r.width}`, r.colors]),
);
if (flags.get("snapshot-out")) {
  writeFileSync(resolve(flags.get("snapshot-out")), JSON.stringify(snapshot));
  console.log(`wrote computed colors to ${flags.get("snapshot-out")}`);
}
if (flags.get("snapshot-compare")) {
  const baseline = JSON.parse(
    readFileSync(resolve(flags.get("snapshot-compare")), "utf8"),
  );
  const props = ["color", "background-color", "border-top-color"];
  let compared = 0;
  let changed = 0;
  let membership = 0;
  for (const [key, colors] of Object.entries(snapshot)) {
    const before = baseline[key];
    if (!before) {
      console.log(`snapshot: no baseline for ${key}`);
      failed = true;
      continue;
    }
    const shared = Object.keys(colors).filter((path) => path in before);
    // Paths, never text: tag names and sibling indexes only.
    const onlyNow = Object.keys(colors).filter((path) => !(path in before));
    const onlyBefore = Object.keys(before).filter((path) => !(path in colors));
    const added = onlyNow.length;
    const removed = onlyBefore.length;
    membership += added + removed;
    for (const path of onlyNow.slice(0, 5)) {
      console.log(`  ${key} added ${path}`);
    }
    for (const path of onlyBefore.slice(0, 5)) {
      console.log(`  ${key} removed ${path}`);
    }
    let diffs = 0;
    for (const path of shared) {
      compared++;
      colors[path].forEach((value, index) => {
        if (value === before[path][index]) return;
        diffs++;
        if (diffs <= 5) {
          console.log(
            `  ${key} ${path} ${props[index]}: ${before[path][index]} -> ${value}`,
          );
        }
      });
    }
    changed += diffs;
    console.log(
      `snapshot ${key}: ${shared.length} elements compared, ${diffs} color changes` +
        `${added || removed ? `, ${added} elements only now, ${removed} only in baseline` : ""}`,
    );
  }
  // A route missing from this run is not compared, so an --only run can use a
  // full baseline.
  console.log(
    `snapshot total: ${compared} elements compared, ${changed} color changes, ${membership} elements added or removed`,
  );
  if (changed || membership) failed = true;
}

if (flags.get("json")) {
  writeFileSync(
    resolve(flags.get("json")),
    JSON.stringify(
      {
        base: BASE,
        widths: WIDTHS,
        modes: modes.map((m) => m.name),
        denied,
        unresolved,
        results: results.map(({ colors, ...rest }) => rest),
      },
      null,
      2,
    ),
  );
}

process.exitCode = failed ? 1 : 0;
