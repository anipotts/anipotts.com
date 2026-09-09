import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
  `Static editorial output: ${pages.length} pages, ${published.length} search records, private exclusions${origin ? ", served routes and redirects" : ""} passed`,
);
