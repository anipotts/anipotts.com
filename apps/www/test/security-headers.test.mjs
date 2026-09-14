import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, join } from "node:path";
import test from "node:test";
import {
  SECURITY_HEADERS,
  withSecurityHeaders,
} from "../src/lib/security-headers.ts";
import { dist } from "./built-html.mjs";

// Runs after the www build against the emitted Worker, so the adapter's own
// early ASSETS returns are exercised. Node stands in for workerd: only the
// runtime module import and the caches global need stubs.
registerHooks({
  resolve(specifier, context, next) {
    return specifier === "cloudflare:workers"
      ? {
          url: "data:text/javascript,export const env = {};",
          shortCircuit: true,
        }
      : next(specifier, context);
  },
});
globalThis.caches ??= {};
const worker = (await import(join(dist, "_worker.js", "index.js"))).default;

const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
};

function file(pathname) {
  if (pathname.startsWith("/_worker.js")) return null;
  const base = pathname === "/" ? "/index" : pathname;
  for (const candidate of [base, `${base}.html`, `${base}/index.html`]) {
    const path = join(dist, decodeURIComponent(candidate));
    if (existsSync(path) && statSync(path).isFile()) return path;
  }
  return null;
}

/** The ASSETS binding as the adapter sees it: html_handling resolves
 *  extensionless paths, validators come back, and headers are immutable. */
const ASSETS = {
  async fetch(input) {
    const request = input instanceof Request ? input : new Request(input);
    const path = file(new URL(request.url).pathname);
    if (!path) return immutable(new Response("not found", { status: 404 }));
    const bytes = readFileSync(path);
    const etag = `"${createHash("sha256").update(bytes).digest("hex").slice(0, 32)}"`;
    const headers = {
      "cache-control": "public, max-age=0, must-revalidate",
      "content-type": TYPES[extname(path)] ?? "application/octet-stream",
      etag,
    };
    if (request.headers.get("if-none-match") === etag)
      return immutable(new Response(null, { status: 304, headers }));
    return immutable(new Response(bytes, { headers }));
  },
};

function immutable(response) {
  for (const method of ["append", "delete", "set"]) {
    Object.defineProperty(response.headers, method, {
      value() {
        throw new TypeError("Can't modify immutable headers.");
      },
    });
  }
  return response;
}

const ctx = { waitUntil() {}, passThroughOnException() {} };
const serve = (url, init) =>
  worker.fetch(new Request(url, init), { ASSETS }, ctx);

function assertSecured(response, label) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    // A duplicated header would read back comma-joined, so equality proves one.
    assert.equal(response.headers.get(name), value, `${label}: ${name}`);
  }
}

const built = (dir, ext) =>
  readdirSync(join(dist, dir)).filter((name) => name.endsWith(ext));
const project = `/work/${built("work", ".html")[0].slice(0, -5)}`;
const post = `/writing/${built("writing", ".html")[0].slice(0, -5)}`;
const script = `/_astro/${built("_astro", ".js")[0]}`;
const stylesheet = `/_astro/${built("_astro", ".css")[0]}`;

// Prerendered pages and manifest assets are answered before middleware runs.
const ASSET_PATHS = [
  "/",
  "/index.html",
  "/writing",
  "/work",
  "/systems",
  "/links",
  "/404",
  project,
  post,
  script,
  stylesheet,
  "/favicon.svg",
  "/feed.xml",
  "/robots.txt",
  "/sitemap.xml",
  "/search-index.json",
];

test("every host gets the header set once on pages and static assets", async () => {
  const unsecured = [];
  for (const host of [
    "anipotts.com",
    "staging.anipotts.com",
    "news.anipotts.com",
  ]) {
    for (const path of [...ASSET_PATHS, "/definitely-missing"]) {
      const response = await serve(`https://${host}${path}`);
      const wrong = Object.entries(SECURITY_HEADERS)
        .filter(([name, value]) => response.headers.get(name) !== value)
        .map(([name]) => name);
      if (wrong.length)
        unsecured.push(`${host}${path} (${wrong.length} wrong)`);
    }
  }
  assert.deepEqual(unsecured, []);
});

test("asset responses keep status, body and validators", async () => {
  for (const path of ASSET_PATHS) {
    const served = await serve(`https://anipotts.com${path}`);
    const raw = await ASSETS.fetch(`https://anipotts.com${path}`);
    assert.equal(served.status, raw.status, path);
    for (const name of ["cache-control", "content-type", "etag"]) {
      assert.equal(served.headers.get(name), raw.headers.get(name), path);
    }
    assert.deepEqual(
      Buffer.from(await served.arrayBuffer()),
      Buffer.from(await raw.arrayBuffer()),
      path,
    );
  }
});

test("a revalidated page stays a bodyless 304 with its validator", async () => {
  const etag = (
    await ASSETS.fetch(`https://anipotts.com${project}`)
  ).headers.get("etag");
  const response = await serve(`https://anipotts.com${project}`, {
    headers: { "if-none-match": etag },
  });
  assert.equal(response.status, 304);
  assert.equal(response.body, null);
  assert.equal(response.headers.get("etag"), etag);
  assertSecured(response, `${project} 304`);
});

test("redirects, text 404s and API responses keep their contract", async () => {
  const renamed = await serve("https://anipotts.com/thoughts/example?ref=qa");
  assert.equal(renamed.status, 301);
  assert.equal(renamed.headers.get("location"), "/writing/example?ref=qa");
  assertSecured(renamed, "/thoughts/example");

  const unpublished = await serve("https://anipotts.com/newsletter");
  assert.equal(unpublished.status, 404);
  assert.equal(unpublished.headers.get("x-robots-tag"), "noindex");
  assert.equal(await unpublished.text(), "not found");
  assertSecured(unpublished, "/newsletter");

  const missing = await serve("https://anipotts.com/definitely-missing");
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get("content-type"), /^text\/html/);

  // No DB binding here, so the route reports its existing unavailable state.
  const health = await serve("https://anipotts.com/api/health");
  assert.equal(health.status, 503);
  assert.deepEqual(Object.keys(await health.json()), [
    "app",
    "ok",
    "d1",
    "tables_ok",
    "release_sha",
    "schema_version",
    "ts",
  ]);
  assertSecured(health, "/api/health");
});

test("immutable responses are copied and upstream values are kept", async () => {
  const redirect = Response.redirect("https://anipotts.com/work", 308);
  assert.throws(() => redirect.headers.set("x-probe", "1"), TypeError);
  const secured = withSecurityHeaders(redirect);
  assert.equal(secured.status, 308);
  assert.equal(secured.headers.get("location"), "https://anipotts.com/work");
  assertSecured(secured, "redirect");

  const strict = "default-src 'none'";
  const route = withSecurityHeaders(
    new Response("<p>ok</p>", {
      status: 201,
      headers: {
        "content-security-policy": strict,
        "content-type": "text/html",
      },
    }),
  );
  assert.equal(route.status, 201);
  assert.equal(route.headers.get("content-security-policy"), strict);
  assert.equal(route.headers.get("x-frame-options"), "DENY");
  assert.equal(await route.text(), "<p>ok</p>");

  assert.equal(
    withSecurityHeaders(secured),
    secured,
    "complete sets pass through",
  );

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("chunk one, "));
      controller.enqueue(new TextEncoder().encode("chunk two"));
      controller.close();
    },
  });
  const streamed = withSecurityHeaders(new Response(stream));
  assert.equal(await streamed.text(), "chunk one, chunk two");

  const notModified = withSecurityHeaders(
    new Response(null, { status: 304, headers: { etag: '"v1"' } }),
  );
  assert.equal(notModified.status, 304);
  assert.equal(notModified.body, null);
  assert.equal(notModified.headers.get("etag"), '"v1"');
});

test("the header map has one source", () => {
  const src = new URL("../src/", import.meta.url);
  const sources = readdirSync(src, { recursive: true })
    .filter((name) => /\.(astro|m?[jt]s)$/.test(name))
    .filter((name) =>
      readFileSync(new URL(name, src), "utf8").match(
        /content-security-policy|strict-transport-security|x-frame-options/i,
      ),
    );
  assert.deepEqual(sources, [join("lib", "security-headers.ts")]);
  for (const entry of ["middleware.ts", "worker.ts"]) {
    assert.match(
      readFileSync(new URL(entry, src), "utf8"),
      /from "\.\/lib\/security-headers"/,
      entry,
    );
  }
  for (const dir of ["../public/", "../dist/"]) {
    assert.equal(existsSync(new URL(`${dir}_headers`, import.meta.url)), false);
  }
});
