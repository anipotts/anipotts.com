import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parse } from "yaml";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dist = join(root, "apps/www/dist");
function records(kind) {
  return readdirSync(join(root, "content/public", kind))
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const raw = readFileSync(
        join(root, "content/public", kind, file),
        "utf8",
      );
      const data = parse(raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "");
      return { slug: data.slug ?? file.slice(0, -3), data };
    });
}
const projects = records("projects");
const writing = records("writing");
const visible = projects.filter(({ data }) =>
  ["featured", "listed"].includes(data.public_state),
);
const published = writing.filter(({ data }) => data.status === "published");
const privateRoutes = [
  "/newsletter",
  "/newsletter/archive",
  ...projects
    .filter(({ data }) => data.public_state === "hidden")
    .map(({ slug }) => `/work/${slug}`),
  ...writing
    .filter(({ data }) => data.status !== "published")
    .map(({ slug }) => `/writing/${slug}`),
];
const pages = [
  "/",
  "/work",
  "/writing",
  "/systems",
  ...visible.map(({ slug }) => `/work/${slug}`),
  ...published.map(({ slug }) => `/writing/${slug}`),
];
for (const path of pages) {
  const file = join(
    dist,
    path === "/" ? "index.html" : `${path.slice(1)}.html`,
  );
  assert.ok(existsSync(file), `Missing prebuilt page: ${path}`);
  assert.match(
    readFileSync(file, "utf8"),
    /<h1\b/,
    `${path} must include readable static content`,
  );
}
const feed = readFileSync(join(dist, "feed.xml"), "utf8");
const sitemap = readFileSync(join(dist, "sitemap.xml"), "utf8");
const index = JSON.parse(readFileSync(join(dist, "search-index.json"), "utf8"));
assert.deepEqual(
  index.map(({ slug }) => slug).sort(),
  published.map(({ slug }) => slug).sort(),
);
for (const path of privateRoutes) {
  assert.equal(
    existsSync(join(dist, `${path.slice(1)}.html`)),
    false,
    `Private page emitted: ${path}`,
  );
  assert.ok(
    !feed.includes(path) && !sitemap.includes(path),
    `Private route in public discovery: ${path}`,
  );
}

// Every route unfurls with a card that was actually built, at the size the
// meta claims, and each essay carries its own card, not the shared site one.
const cards = new Map();
for (const path of pages) {
  const html = readFileSync(
    join(dist, path === "/" ? "index.html" : `${path.slice(1)}.html`),
    "utf8",
  );
  const image = html.match(/property="og:image" content="([^"]+)"/)?.[1];
  assert.ok(image, `${path} has no og:image`);
  assert.match(
    html,
    /property="og:image:width" content="1200"/,
    `${path} og:image:width`,
  );
  assert.match(
    html,
    /property="og:image:height" content="630"/,
    `${path} og:image:height`,
  );
  assert.match(
    html,
    /property="og:image:alt" content="[^"]+"/,
    `${path} og:image:alt`,
  );
  assert.equal(
    html.match(/name="twitter:image" content="([^"]+)"/)?.[1],
    image,
    `${path} twitter:image must match og:image`,
  );
  const file = join(dist, new URL(image).pathname.slice(1));
  assert.ok(existsSync(file), `${path} og:image is not in dist: ${image}`);
  const png = readFileSync(file);
  assert.equal(png.readUInt32BE(16), 1200, `${image} width`);
  assert.equal(png.readUInt32BE(20), 630, `${image} height`);
  assert.ok(
    png.length < 150 * 1024,
    `${image} is ${png.length} bytes, over the unfurl budget`,
  );
  cards.set(path, image);
}
for (const { slug } of published) {
  const card = cards.get(`/writing/${slug}`);
  assert.equal(
    card,
    `https://anipotts.com/social/writing-${slug}.png`,
    `/writing/${slug} must carry its own card`,
  );
  assert.notEqual(
    card,
    cards.get("/"),
    `/writing/${slug} reuses the site card`,
  );
}

// House style bans dividers. Spacing carries section breaks, so built pages
// must not paint one-sided rules, hairline pseudo elements or <hr>.
const dividerAllowlist = [
  // SystemMap connectors are an approved diagram, not dividers. Match the
  // exact built selectors so a new .step-* rule cannot borrow the exemption.
  /^\.step(:first-child:before|\+\.step:before)?$/,
  /^\.step-flow:after$/,
  /^\.return-route(:before|:after)?$/,
  /^\.intake-line$/,
  // Quoted article prose keeps its quotation bar.
  /^\.editorial-detail \.article-body blockquote$/,
];
function builtFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "_worker.js") builtFiles(file, found);
    } else if (/\.(css|html)$/.test(entry.name)) found.push(file);
  }
  return found;
}
function styleRules(css) {
  const rules = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < css.length; i += 1) {
    if (css[i] === "{") {
      if (stack.length) stack[stack.length - 1].nested = true;
      stack.push({ prelude: css.slice(start, i).trim(), body: i + 1 });
      start = i + 1;
    } else if (css[i] === "}") {
      const block = stack.pop();
      if (block && !block.nested && !block.prelude.startsWith("@")) {
        rules.push({ selector: block.prelude, body: css.slice(block.body, i) });
      }
      start = i + 1;
    } else if (css[i] === ";" && stack.length === 0) {
      start = i + 1;
    }
  }
  return rules;
}
function dividerReasons(selector, body) {
  const decls = body
    .split(";")
    .filter((part) => part.includes(":"))
    .map((part) => {
      const colon = part.indexOf(":");
      return [
        part.slice(0, colon).trim().toLowerCase(),
        part.slice(colon + 1).trim(),
      ];
    });
  const reasons = [];
  for (const [property, value] of decls) {
    const tokens = value.replace(/!important/, "").split(/\s+(?![^(]*\))/);
    if (
      /^border-(top|bottom|left|right|block|inline)(-(start|end))?(-width)?$/.test(
        property,
      )
    ) {
      const widths = tokens.filter((token) =>
        /^([\d.]+[a-z%]*|thin|medium|thick)$/.test(token),
      );
      const painted = !tokens.some((token) =>
        /^(none|hidden|transparent)$/.test(token),
      );
      const wide = widths.length
        ? widths.some((token) => !/^0+(\.0+)?[a-z%]*$/.test(token))
        : tokens.some((token) =>
            /^(solid|dashed|dotted|double|groove|ridge|inset|outset)$/.test(
              token,
            ),
          );
      if (painted && wide) reasons.push(`${property}:${value}`);
    }
    if (
      (property === "border-width" &&
        new Set(tokens.map((token) => /^0+[a-z%]*$/.test(token))).size > 1) ||
      (property === "border-style" &&
        new Set(tokens.map((token) => /^(none|hidden)$/.test(token))).size > 1)
    ) {
      reasons.push(`${property}:${value}`);
    }
    if (
      property === "box-shadow" &&
      /(^|,)\s*(inset\s+)?(0\s+-?1px|-?1px\s+0)(\s+0){0,2}\s+[^\s,\d.-]/.test(
        value,
      )
    ) {
      reasons.push(`${property}:${value}`);
    }
    // Transparent sides, column rules and 1px gradient strips paint rules too.
    if (
      (property === "border-color" &&
        new Set(tokens.map((token) => token === "transparent")).size > 1) ||
      (/^column-rule(-width|-style)?$/.test(property) &&
        !tokens.some((token) => /^(none|hidden|0+[a-z%]*)$/.test(token))) ||
      (/^background(-size)?$/.test(property) &&
        (property === "background-size" || /gradient\(/.test(value)) &&
        /(^|[\s/])(1px|\.0625rem)(?=[\s,]|$)/.test(value))
    ) {
      reasons.push(`${property}:${value}`);
    }
  }
  // A full border with some sides zeroed paints the remaining sides as rules.
  const boxed = decls.some(
    ([property, value]) =>
      property === "border" &&
      !/(^|\s)(0|none|hidden)(\s|$)/.test(value.replace(/!important/, "")),
  );
  const zeroed = decls.filter(
    ([property, value]) =>
      /^border-(top|bottom|left|right|block|inline)(-(start|end))?(-(width|style))?$/.test(
        property,
      ) && /^(0+[a-z%]*|none|hidden)(\s*!important)?$/.test(value),
  );
  if (boxed && zeroed.length)
    reasons.push(
      `border with ${zeroed.map(([property]) => property).join(",")} zeroed`,
    );
  const thin = decls.some(
    ([property, value]) =>
      /^(height|block-size|width|inline-size)$/.test(property) &&
      /^(1px|\.0625rem)$/.test(value),
  );
  const filled = decls.some(
    ([property, value]) =>
      /^background(-color|-image)?$/.test(property) &&
      !/^(none|transparent)$/.test(value),
  );
  if (/:(before|after)\b/.test(selector) && thin && filled)
    reasons.push("hairline pseudo element");
  return reasons;
}
const dividerViolations = new Set();
for (const file of builtFiles(dist)) {
  const text = readFileSync(file, "utf8");
  const relative = file.slice(dist.length + 1);
  const sheets = [text];
  if (file.endsWith(".html")) {
    sheets.length = 0;
    for (const match of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
      sheets.push(match[1]);
    if (/<hr\b/i.test(text)) dividerViolations.add(`${relative}: <hr>`);
    for (const match of text.matchAll(/\sstyle="([^"]*)"/gi)) {
      for (const reason of dividerReasons("", match[1]))
        dividerViolations.add(`${relative}: style="${reason}"`);
    }
  }
  for (const css of sheets) {
    for (const { selector, body } of styleRules(
      css.replace(/\/\*[\s\S]*?\*\//g, ""),
    )) {
      const reasons = dividerReasons(selector, body);
      const bare = selector.replace(/\[data-astro-cid-[\w-]+\]/g, "");
      const allowed = bare
        .split(",")
        .every((part) =>
          dividerAllowlist.some((pattern) => pattern.test(part.trim())),
        );
      if (reasons.length && !allowed)
        dividerViolations.add(`${bare} { ${reasons.join("; ")} }`);
    }
  }
}
assert.deepEqual(
  [...dividerViolations],
  [],
  "Built pages paint dividers; let spacing carry the break",
);
// Per-file byte ceilings keep marks and screenshots near their rendered size.
// Marks render at 56px or less, so a 3x export stays well under 16kb. Card
// screenshots ship 800 and 1600px variants; full-size files back the viewer.
const kb = 1024;
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(dir, entry.name))
      : [join(dir, entry.name)],
  );
}
const imageFile = /\.(avif|gif|ico|jpe?g|png|svg|webp)$/i;
// Admin Publish commits article images here under its own publication cap
// (MAX_PUBLICATION_MEDIA_BYTES in apps/admin/src/lib/editorial-media.ts).
const editorialMediaCeiling = 10 * kb * kb;
function ceiling(path) {
  if (path.startsWith("/images/editorial/")) return editorialMediaCeiling;
  if (path.startsWith("/images/work/")) {
    if (path.endsWith("-800.webp")) return 48 * kb;
    if (path.endsWith("-1600.webp")) return 128 * kb;
    return 240 * kb;
  }
  if (path.startsWith("/images/brand/") || path.startsWith("/brand/"))
    return 16 * kb;
  return 240 * kb;
}
assert.equal(
  ceiling(`/images/editorial/${"a".repeat(64)}.jpg`),
  editorialMediaCeiling,
  "Published article images are not held to the mark ceiling",
);
const oversized = ["images", "brand"]
  .flatMap((dir) => files(join(dist, dir)))
  .filter((file) => imageFile.test(file))
  .map((file) => ({
    path: `/${file.slice(dist.length + 1).replaceAll("\\", "/")}`,
    bytes: statSync(file).size,
  }))
  .filter(({ path, bytes }) => bytes > ceiling(path))
  .map(({ path, bytes }) => `${path} ${bytes} > ${ceiling(path)}`);
assert.deepEqual(oversized, [], "Image files over their byte ceiling");

// Optional served-build proof catches worker-first routing errors that disk checks cannot.
const origin = process.argv
  .find((arg) => arg.startsWith("--origin="))
  ?.slice(9);
if (origin) {
  for (const path of [
    ...pages,
    "/feed.xml",
    "/sitemap.xml",
    "/search-index.json",
  ]) {
    assert.equal(
      (await fetch(new URL(path, origin), { redirect: "manual" })).status,
      200,
      path,
    );
  }
  for (const path of [
    ...privateRoutes,
    "/work/missing-record",
    "/writing/missing-record",
  ]) {
    assert.equal(
      (await fetch(new URL(path, origin), { redirect: "manual" })).status,
      404,
      path,
    );
  }
  for (const [from, to] of [
    ["/making", "/work"],
    ["/projects", "/work"],
    ["/shipping", "/work"],
    ["/running", "/work"],
    ["/projects/quantercise", "/work/quantercise"],
  ]) {
    const response = await fetch(
      new URL(`${from}?source=qa&next=%2Fwork`, origin),
      { redirect: "manual" },
    );
    assert.equal(response.status, 301, from);
    assert.equal(
      new URL(response.headers.get("location"), origin).pathname,
      to,
    );
    assert.equal(
      new URL(response.headers.get("location"), origin).search,
      "?source=qa&next=%2Fwork",
    );
  }
  // /api/search and the /ingest PostHog proxy are removed. search-index.json
  // stays: it is the published-only artifact the build guard above compares
  // against, and it is served as a static asset.
  for (const path of ["/api/search?q=claude", "/ingest/static/array.js"]) {
    assert.equal(
      (await fetch(new URL(path, origin), { redirect: "manual" })).status,
      404,
      `${path} must stay removed`,
    );
  }
  if (process.argv.includes("--newsletter")) {
    for (const [path, options, status] of [
      ["/api/health", {}, 200],
      ["/api/newsletter/confirm", {}, 400],
      ["/api/newsletter/unsubscribe?token=local-test", {}, 200],
      [
        "/api/newsletter/unsubscribe",
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: "List-Unsubscribe=One-Click",
        },
        200,
      ],
      ["/api/newsletter/webhooks/resend", { method: "POST", body: "{}" }, 501],
      [
        "/api/newsletter/subscribe",
        {
          method: "POST",
          headers: { origin: "https://invalid.example" },
          body: "{}",
        },
        403,
      ],
      [
        "/api/subscribe",
        {
          method: "POST",
          headers: { origin: "https://invalid.example" },
          body: "{}",
        },
        403,
      ],
    ]) {
      const response = await fetch(new URL(path, origin), options);
      assert.equal(response.status, status, path);
      if (path === "/api/health") {
        const health = await response.json();
        assert.equal(health.ok, true);
        assert.equal(health.d1, "connected");
        assert.equal(health.tables_ok, true);
      }
    }
  }
}
console.log(
  `Static editorial output: ${pages.length} pages, ${published.length} search records, private exclusions${origin ? ", served routes and redirects" : ""} passed`,
);
