import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
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
const worker = join(dist, "_worker.js");
const manifestName = readdirSync(worker).find((name) =>
  /^manifest_.*\.mjs$/u.test(name),
);
assert.ok(manifestName, "Missing built worker manifest");
const { manifest } = await import(
  pathToFileURL(join(worker, manifestName)).href
);
for (const path of [
  "/",
  "/work",
  "/writing",
  "/systems",
  "/work/[slug]",
  "/writing/[slug]",
  "/feed.xml",
  "/sitemap.xml",
  "/search-index.json",
  "/api/search",
  "/images/editorial/[id]",
]) {
  const route = manifest.routes.find(
    ({ routeData }) => routeData.route === path,
  );
  assert.ok(route, `Missing built runtime route: ${path}`);
  assert.equal(
    route.routeData.prerender,
    false,
    `Public route must read current publications: ${path}`,
  );
}
for (const path of [...pages, ...privateRoutes]) {
  const file = join(
    dist,
    path === "/" ? "index.html" : `${path.slice(1)}.html`,
  );
  assert.equal(
    existsSync(file),
    false,
    `Stale/private static content could bypass publication visibility: ${path}`,
  );
}
for (const path of ["feed.xml", "sitemap.xml", "search-index.json"]) {
  assert.equal(
    existsSync(join(dist, path)),
    false,
    `Stale static discovery artifact: ${path}`,
  );
}

// Served proof uses an isolated build with no active overrides, so Git is the expected baseline.
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
    const response = await fetch(new URL(path, origin), { redirect: "manual" });
    assert.equal(response.status, 200, path);
    if (pages.includes(path))
      assert.match(
        await response.text(),
        /<h1\b/u,
        `${path} must serve readable content`,
      );
  }
  const feed = await (await fetch(new URL("/feed.xml", origin))).text();
  const sitemap = await (await fetch(new URL("/sitemap.xml", origin))).text();
  const index = await (
    await fetch(new URL("/search-index.json", origin))
  ).json();
  assert.deepEqual(
    index.map(({ slug }) => slug).sort(),
    published.map(({ slug }) => slug).sort(),
  );
  for (const path of privateRoutes) {
    assert.ok(
      !feed.includes(path) && !sitemap.includes(path),
      `Private route in public discovery: ${path}`,
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
  const search = await (
    await fetch(new URL("/api/search?q=claude", origin))
  ).json();
  assert.ok(search.results.length > 0);
  for (const item of search.results) {
    assert.ok(published.some(({ slug }) => slug === item.slug));
    assert.deepEqual(Object.keys(item).sort(), [
      "date",
      "slug",
      "summary",
      "title",
    ]);
  }
  assert.deepEqual(
    await (await fetch(new URL("/api/search?q=%20", origin))).json(),
    { results: [] },
  );
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
  `Runtime editorial output: worker routes and static exclusions passed; ${origin ? `${pages.length} served baseline pages, ${published.length} search records, private exclusions and redirects passed` : "served baseline checks NOT RUN (provide --origin)"}`,
);
