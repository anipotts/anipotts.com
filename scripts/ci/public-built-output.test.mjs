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
// Audit m18: a card token block must keep a real accent apart from its muted
// ink, otherwise the arrow affordance has no hover or focus gesture at all.
const flatCardTokens = new Set();
function declaredToken(body, name) {
  let value = null;
  for (const declaration of body.split(";")) {
    const at = declaration.indexOf(":");
    if (at < 0) continue;
    if (declaration.slice(0, at).trim() !== name) continue;
    value = declaration
      .slice(at + 1)
      .replace(/!important/, "")
      .trim()
      .toLowerCase();
  }
  return value;
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
      const accent = declaredToken(body, "--paper-accent");
      const muted = declaredToken(body, "--paper-muted");
      if (
        accent &&
        muted &&
        accent === muted &&
        /\.(work|writing)-card\b/.test(bare)
      )
        flatCardTokens.add(
          `${bare} { --paper-accent: ${accent} == --paper-muted }`,
        );
    }
  }
}
assert.deepEqual(
  [...dividerViolations],
  [],
  "Built pages paint dividers; let spacing carry the break",
);
assert.deepEqual(
  [...flatCardTokens],
  [],
  "Card tokens collapse the accent into the muted ink, so the arrow has no hover or focus gesture",
);
// Light writing details read on a paper surface under the blue wave header.
// The inks are measured here, so a later colour edit cannot quietly take the
// article back under 4.5:1, which is where it sat before the paper landed.
const lightCanvas = "#61abea";
function channel(value) {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function rgb(hex) {
  const value = hex.trim().replace(/^#/, "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((part) => part + part)
          .join("")
      : value;
  assert.match(full, /^[0-9a-f]{6}$/i, `Unreadable colour: ${hex}`);
  return [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16));
}
function luminance(hex) {
  const [r, g, b] = rgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(foreground, background) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}
const readingScope = "html.writing-detail:not([data-theme=dark])";
const readingRules = builtFiles(dist)
  .filter((file) => file.endsWith(".css"))
  .flatMap((file) =>
    styleRules(readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")),
  )
  .filter((rule) => rule.selector.startsWith(readingScope));
function declaration(rule, property) {
  const matches = [
    ...rule.body.matchAll(
      new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "g"),
    ),
  ];
  return matches.length ? matches[matches.length - 1][1].trim() : null;
}
const headerRule = readingRules.find(
  (rule) =>
    rule.selector === readingScope && declaration(rule, "--reading-paper"),
);
assert.ok(
  headerRule,
  "Light writing details must declare the reading surface tokens",
);
const paper = declaration(headerRule, "--reading-paper");
const surfaceRule = readingRules.find(
  (rule) =>
    rule.selector.includes(".article-body") &&
    declaration(rule, "background-color"),
);
assert.ok(
  surfaceRule,
  "Light writing details must paint the article on the reading surface",
);
for (const [rule, property, background, minimum] of [
  [headerRule, "--ink", lightCanvas, 4.5],
  [headerRule, "--ink-muted", lightCanvas, 4.5],
  [headerRule, "--focus", lightCanvas, 3],
  [surfaceRule, "--ink", paper, 4.5],
  [surfaceRule, "--ink-muted", paper, 4.5],
  [surfaceRule, "--interactive", paper, 4.5],
  [surfaceRule, "--focus", paper, 3],
]) {
  const colour = declaration(rule, property);
  assert.ok(colour, `Light writing details must declare ${property}`);
  const measured = contrast(colour, background);
  assert.ok(
    measured >= minimum,
    `${property} ${colour} on ${background} is ${measured.toFixed(2)}:1, under ${minimum}:1`,
  );
}
// House style is phosphor only, so an affordance is never a text arrow. Built
// markup carries no arrow character and no arrow entity. SystemMap's step
// connectors are an approved diagram, so their pseudo content keeps its glyph
// if that rule is ever inlined into a page.
const arrowCharacter = /[←-⇿➡➔➜⬅-⬍⮕]/u;
const arrowEntity =
  /&(?:[lrud]arr|[lrud]Arr|harr|hArr|[ns][ew]arr|#x0*2(?:1(?:9[0-9A-F]|[A-F][0-9A-F])|7A1|B0[5-9A-D]|B95)|#0*8(?:59[2-9]|60[0-1])|#0*11(?:169|173));/i;
const systemMapStepRule =
  /^\.step(:not\(:last-child\)|\s*\+\s*\.step)?::?(before|after)$/;
function arrowHits(text) {
  const hits = [];
  const parts = text.split(/(<style\b[^>]*>[\s\S]*?<\/style>)/i);
  for (const [index, chunk] of parts.entries()) {
    if (index % 2 === 0) {
      // Markup, attributes and visible text: no arrow glyph of any kind.
      const character = chunk.match(arrowCharacter);
      if (character) hits.push(`character ${JSON.stringify(character[0])}`);
      const entity = chunk.match(arrowEntity);
      if (entity) hits.push(`entity ${entity[0]}`);
      continue;
    }
    const css = chunk
      .replace(/^<style\b[^>]*>/i, "")
      .replace(/<\/style>$/i, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    for (const { selector, body } of styleRules(css)) {
      if (!arrowCharacter.test(body) && !arrowEntity.test(body)) continue;
      const bare = selector.replace(/\[data-astro-cid-[\w-]+\]/g, "");
      const allowed = bare
        .split(",")
        .every((part) => systemMapStepRule.test(part.trim()));
      if (!allowed) hits.push(`${bare} { arrow glyph in css }`);
    }
  }
  return hits;
}
const arrowViolations = [];
for (const file of builtFiles(dist)) {
  if (!file.endsWith(".html")) continue;
  for (const hit of arrowHits(readFileSync(file, "utf8")))
    arrowViolations.push(`${file.slice(dist.length + 1)}: ${hit}`);
}
assert.deepEqual(
  arrowViolations,
  [],
  "Built pages render text arrows; use a phosphor glyph instead",
);
// One display scale. Hero, detail-hero and lede sizes come from the www
// tokens in global.css, and the detail hero caps where the 944px column
// stops growing so a title never re-wraps between 1024 and 1920.
const displayTokens = [
  "--d-hero",
  "--d-hero-compact",
  "--d-hero-detail",
  "--d-lede",
];
// The leading dot is its own boundary, so a compound selector such as
// h1.hero-title is caught alongside a descendant one.
const scaledSelectors =
  /(\.hero-title|\.page-hero__title|\.home-hero|\.title|\.links-page h1|\.summary|\.project-summary|\.hero-line|\.page-hero__summary)([\s,:.[]|$)/;
const scaleViolations = new Set();
const declaredTokens = new Set();
let detailCap = null;
for (const file of builtFiles(dist)) {
  const text = readFileSync(file, "utf8");
  const relative = file.slice(dist.length + 1);
  const sheets = file.endsWith(".html")
    ? [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1])
    : [text];
  if (/--d-section\b/.test(text))
    scaleViolations.add(`${relative}: --d-section is not defined anywhere`);
  for (const css of sheets) {
    for (const { selector, body } of styleRules(
      css.replace(/\/\*[\s\S]*?\*\//g, ""),
    )) {
      for (const token of displayTokens) {
        const declared = body.match(
          new RegExp(`${token}\\s*:\\s*([^;]+)`, "i"),
        );
        if (!declared) continue;
        declaredTokens.add(token);
        if (token === "--d-hero-detail") detailCap = declared[1].trim();
      }
      const bare = selector.replace(/\[data-astro-cid-[\w-]+\]/g, "");
      if (!scaledSelectors.test(bare)) continue;
      const size = body.match(/(?:^|;)\s*font-size\s*:\s*([^;]+)/i);
      if (size && !/var\(--/.test(size[1]))
        scaleViolations.add(
          `${bare} { font-size: ${size[1].trim()} } must use a display token`,
        );
    }
  }
}
assert.deepEqual(
  [...scaleViolations],
  [],
  "Hero and lede sizes drifted from the shared www display tokens",
);
assert.deepEqual(
  displayTokens.filter((token) => !declaredTokens.has(token)),
  [],
  "Built css is missing a www display token",
);
assert.equal(
  detailCap,
  "clamp(2.6rem, 6.6vw, 4.2rem)",
  "The detail hero must cap where the 944px column stops growing",
);
// /work groups its catalog with the same section label home uses.
const workHeadings = [
  ...readFileSync(join(dist, "work.html"), "utf8").matchAll(
    /<h2\b[^>]*id="heading-[^"]*"[^>]*>/gi,
  ),
].map((match) => match[0]);
assert.ok(workHeadings.length >= 2, "/work must render bucket headings");
assert.deepEqual(
  workHeadings.filter((tag) => !/class="[^"]*\bsection-label\b/.test(tag)),
  [],
  "/work bucket headings must use section-label",
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
