/** Seeded-D1 parity. Runs the built Worker twice under local workerd: once in
 * legacy (Git) mode and once with CONTENT_RUNTIME=cms against a local D1 that
 * scripts/content/seed-content-d1.mjs seeded. Compares every public route on
 * every production hostname. Local only: no provider account or remote ID.
 *
 *   node apps/www/test/cms-seed-parity.mjs [--report path.json]
 * Requires a prior `pnpm turbo build --filter=@anipotts/www...`. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { collectGitSeed } from "../../../scripts/content/content-d1-seed.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "www-cms-parity-"));
const state = join(temporary, "state");
const cli = join(
  dirname(createRequire(import.meta.url).resolve("wrangler/package.json")),
  "bin/wrangler.js",
);
const env = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" };
const hosts = ["anipotts.com", "staging.anipotts.com", "news.anipotts.com"];
const database = {
  binding: "CONTENT_DB",
  database_name: "anipotts-content",
  database_id: "2679fc97-e251-46b7-ad01-db8b9fe04e8d",
};
function config(name, vars) {
  const path = join(temporary, `${name}.json`);
  writeFileSync(
    path,
    JSON.stringify({
      name: `cms-parity-${name}`,
      main: join(root, "apps/www/dist/_worker.js/index.js"),
      compatibility_date: "2026-05-01",
      compatibility_flags: ["nodejs_compat"],
      assets: {
        directory: join(root, "apps/www/dist"),
        binding: "ASSETS",
        run_worker_first: true,
      },
      vars,
      d1_databases: [database],
    }),
  );
  return path;
}
function run(args, cwd = temporary) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.status !== 0)
    throw new Error(`${args.join(" ")}\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}
async function serve(configPath) {
  const child = spawn(
    process.execPath,
    [
      cli,
      "dev",
      "--local",
      "--config",
      configPath,
      "--persist-to",
      state,
      "--ip",
      "127.0.0.1",
      "--port",
      "0",
      "--show-interactive-dev-session=false",
    ],
    { cwd: temporary, env, detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const origin = output.match(/Ready on (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
    if (origin) return { child, origin };
    if (child.exitCode !== null) throw new Error(output.slice(-4000));
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`startup timeout ${output.slice(-4000)}`);
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  process.kill(-child.pid, "SIGTERM");
  await Promise.race([
    new Promise((r) => child.once("exit", r)),
    new Promise((r) => setTimeout(r, 5000)),
  ]);
  if (child.exitCode === null) process.kill(-child.pid, "SIGKILL");
}
/** Raw HTTP so the production Host header reaches the Worker unchanged. */
function get(origin, host, path) {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const req = request(
      { host: url.hostname, port: url.port, path, headers: { host } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/** Every normalization is listed here and in the report. None rewrite content. */
export const NORMALIZATIONS = [
  "headers are compared separately from bodies; cms-only X-Content-Version, X-Content-Schema, X-Content-SHA256, X-Content-Cache, CDN-Cache-Control and Cloudflare-CDN-Cache-Control are expected runtime differences",
  "Cache-Control is checked on its own: a cms 200 on a content route must revalidate (public, max-age=0, must-revalidate) with a cms version ETag, and every other cms response must be no-store",
  "the Date, cf-ray style transport headers, Content-Length and ETag are ignored in the legacy comparison",
];
/** The cms cache contract for a response the published reader answered
 * (it carries X-Content-Version). Returns a problem or null. */
function cmsCacheProblem(path, response) {
  if (!response.headers["x-content-version"]) return null;
  const cacheControl = response.headers["cache-control"];
  const etag = response.headers.etag;
  const cacheable =
    response.status === 200 &&
    path !== "/api/content-version" &&
    !path.startsWith("/images/");
  if (cacheable)
    return cacheControl === "public, max-age=0, must-revalidate" &&
      /^"cms1-v\d+-[0-9a-f]{24}"$/u.test(etag ?? "")
      ? null
      : `cacheable 200 had ${cacheControl} ${etag}`;
  return cacheControl === "no-store" && !etag
    ? null
    : `non-cacheable ${response.status} had ${cacheControl} ${etag}`;
}
/** Bodies are compared byte for byte. */
const normalize = (_path, body) => body;
const ignoredHeaders = new Set([
  "date",
  "content-length",
  "etag",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "x-content-version",
  "x-content-schema",
  "x-content-sha256",
  "x-content-cache",
  "cdn-cache-control",
  "cloudflare-cdn-cache-control",
  "cache-control",
]);
function lineDiff(a, b, limit = 40) {
  const left = a.split("\n");
  const right = b.split("\n");
  const out = [];
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i] === right[i]) continue;
    out.push(`@@ line ${i + 1}`);
    if (left[i] !== undefined) out.push(`- ${left[i].slice(0, 400)}`);
    if (right[i] !== undefined) out.push(`+ ${right[i].slice(0, 400)}`);
    if (out.length >= limit) {
      out.push("... truncated");
      break;
    }
  }
  return out;
}
/** Split HTML at tag boundaries so a one-line document still diffs readably. */
const tokens = (body) => body.replace(/>\s*</g, ">\n<");

const report = { normalizations: NORMALIZATIONS, routes: [] };
let legacy;
let cms;
try {
  const seed = await collectGitSeed(root);
  const migrations = join(temporary, "migrations.sql");
  writeFileSync(
    migrations,
    ["0001_published_snapshots.sql", "0002_content_schema_version.sql"]
      .map((name) =>
        readFileSync(
          join(root, "apps/admin/migrations/content-publication", name),
          "utf8",
        ),
      )
      .join("\n"),
  );
  const cmsConfig = config("cms", { CONTENT_RUNTIME: "cms" });
  const legacyConfig = config("legacy", {});
  run([
    cli,
    "d1",
    "execute",
    "CONTENT_DB",
    "--local",
    "--config",
    cmsConfig,
    "--persist-to",
    state,
    "--file",
    migrations,
  ]);
  run(
    [
      join(root, "scripts/content/seed-content-d1.mjs"),
      "--local",
      "--persist-to",
      state,
      "--apply",
      "--published-at",
      "2026-09-21T00:00:00.000Z",
    ],
    root,
  );
  report.seed = { counts: seed.counts, total: seed.records.length };
  const slugs = (kind) =>
    seed.records
      .filter((r) => r.record.kind === kind)
      .map((r) => {
        const slug = /^slug:\s*(\S+)/m.exec(r.source)?.[1];
        return slug ? slug.replace(/^["']|["']$/g, "") : r.record.id;
      });
  const paths = [
    "/",
    "/work",
    "/writing",
    "/systems",
    "/links",
    "/feed.xml",
    "/sitemap.xml",
    "/search-index.json",
    "/robots.txt",
    ...slugs("writing").map((s) => `/writing/${s}`),
    ...slugs("work").map((s) => `/work/${s}`),
    // Git-only hidden/draft records must stay unreachable in both modes.
    ...seed.excluded
      .filter((e) => e.record?.kind === "writing")
      .map((e) => `/writing/${e.record.id}`),
    ...seed.excluded
      .filter((e) => e.record?.kind === "work")
      .map((e) => `/work/${e.record.id}`),
  ];
  legacy = await serve(legacyConfig);
  cms = await serve(cmsConfig);
  const version = await get(cms.origin, "anipotts.com", "/api/content-version");
  report.contentVersion = JSON.parse(version.body);
  for (const host of hosts)
    for (const path of paths) {
      const [a, b] = await Promise.all([
        get(legacy.origin, host, path),
        get(cms.origin, host, path),
      ]);
      const headerDiff = [
        ...new Set([...Object.keys(a.headers), ...Object.keys(b.headers)]),
      ]
        .filter((name) => !ignoredHeaders.has(name))
        .filter((name) => String(a.headers[name]) !== String(b.headers[name]))
        .map((name) => ({
          name,
          legacy: a.headers[name],
          cms: b.headers[name],
        }));
      const left = normalize(path, a.body);
      const right = normalize(path, b.body);
      const same = a.status === b.status && left === right;
      const cacheProblem = cmsCacheProblem(path, b);
      report.routes.push({
        host,
        path,
        legacyStatus: a.status,
        cmsStatus: b.status,
        cmsVersion: b.headers["x-content-version"] ?? null,
        cmsCacheControl: b.headers["cache-control"] ?? null,
        cacheProblem,
        identical: same && headerDiff.length === 0 && !cacheProblem,
        rawBodyIdentical: a.body === b.body,
        normalized: a.body !== b.body && left === right,
        headerDiff,
        diff: left === right ? [] : lineDiff(tokens(left), tokens(right)),
      });
    }
} finally {
  await stop(legacy?.child);
  await stop(cms?.child);
  rmSync(temporary, { recursive: true, force: true });
}
const reportPath = process.argv.includes("--report")
  ? process.argv[process.argv.indexOf("--report") + 1]
  : null;
if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2));
const differing = report.routes.filter((r) => !r.identical);
for (const r of report.routes)
  console.log(
    `${r.identical ? (r.normalized ? "same*" : "same") : "DIFF"} ${r.legacyStatus}/${r.cmsStatus} v${r.cmsVersion ?? "-"} ${r.host}${r.path}`,
  );
console.log(
  `${report.routes.length - differing.length}/${report.routes.length} identical; seed ${JSON.stringify(report.seed)}`,
);
if (differing.length) process.exitCode = 1;
