/** Seeded-D1 route smoke. Seeds a local D1 with the recovery seed
 * (scripts/content/seed-content-d1.mjs), serves the built Worker under local
 * workerd with CONTENT_RUNTIME=cms, and checks every public route on every
 * production hostname: status, the cms cache contract, and that each seeded
 * record is answered from the store. published-runtime.test.mjs proves in
 * process that a seeded store renders byte for byte like the bundled
 * defaults. Local only: no provider account or remote ID.
 *
 *   node apps/www/test/cms-seed-routes.mjs [--report path.json]
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
const temporary = mkdtempSync(join(tmpdir(), "www-cms-routes-"));
const state = join(temporary, "state");
const cli = join(
  dirname(createRequire(import.meta.url).resolve("wrangler/package.json")),
  "bin/wrangler.js",
);
const env = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" };
const hosts = ["anipotts.com", "staging.anipotts.com", "news.anipotts.com"];
const config = join(temporary, "wrangler.json");
writeFileSync(
  config,
  JSON.stringify({
    name: "cms-seed-routes",
    main: join(root, "apps/www/dist/_worker.js/index.js"),
    compatibility_date: "2026-05-01",
    compatibility_flags: ["nodejs_compat"],
    assets: {
      directory: join(root, "apps/www/dist"),
      binding: "ASSETS",
      run_worker_first: true,
    },
    vars: { CONTENT_RUNTIME: "cms" },
    d1_databases: [
      {
        binding: "CONTENT_DB",
        database_name: "anipotts-content",
        database_id: "2679fc97-e251-46b7-ad01-db8b9fe04e8d",
      },
    ],
  }),
);
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
async function serve() {
  const child = spawn(
    process.execPath,
    [
      cli,
      "dev",
      "--local",
      "--config",
      config,
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
/** The cms cache contract for a response the published reader answered
 * (it carries X-Content-Version). Returns a problem or null. */
function cacheProblem(path, response) {
  if (!response.headers["x-content-version"]) return null;
  const cacheControl = response.headers["cache-control"];
  const etag = response.headers.etag;
  if (response.headers["x-content-version"] !== "1")
    return `inventory ${response.headers["x-content-version"]}, not the seed`;
  const cacheable =
    response.status === 200 &&
    path !== "/api/content-version" &&
    !path.startsWith("/images/");
  if (cacheable)
    return cacheControl === "public, max-age=0, must-revalidate" &&
      /^"cms1-v1-[0-9a-f]{24}"$/u.test(etag ?? "")
      ? null
      : `cacheable 200 had ${cacheControl} ${etag}`;
  return cacheControl === "no-store" && !etag
    ? null
    : `non-cacheable ${response.status} had ${cacheControl} ${etag}`;
}
const slugOf = (record) => {
  const slug = /^slug:\s*(\S+)/m.exec(record.source)?.[1];
  return slug ? slug.replace(/^["']|["']$/g, "") : record.record.id;
};

const report = { routes: [] };
let worker;
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
  run([
    cli,
    "d1",
    "execute",
    "CONTENT_DB",
    "--local",
    "--config",
    config,
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
  // Each detail route and the digest of the record that must answer it.
  const detail = new Map(
    seed.records
      .filter((r) => r.record.kind !== "page")
      .map((r) => [
        `/${r.record.kind === "work" ? "work" : "writing"}/${slugOf(r)}`,
        r.sourceSha256,
      ]),
  );
  const expected = new Map([
    ...[
      "/",
      "/work",
      "/writing",
      "/systems",
      "/feed.xml",
      "/sitemap.xml",
      "/search-index.json",
      "/links",
      "/robots.txt",
    ].map((path) => [path, 200]),
    ...[...detail.keys()].map((path) => [path, 200]),
    // Git-only hidden and draft records stay unreachable.
    ...seed.excluded
      .filter((e) => e.record?.kind === "writing" || e.record?.kind === "work")
      .map((e) => [
        `/${e.record.kind === "work" ? "work" : "writing"}/${e.record.id}`,
        404,
      ]),
  ]);
  worker = await serve();
  const version = await get(
    worker.origin,
    "anipotts.com",
    "/api/content-version",
  );
  report.contentVersion = JSON.parse(version.body);
  const problems = [];
  if (report.contentVersion.runtime !== 1) problems.push("reader not ready");
  if (report.contentVersion.inventoryVersion !== 1)
    problems.push("seed is not one activation");
  if (report.contentVersion.bundledSourceSha256 !== seed.bundledSourceSha256)
    problems.push("reader baseline differs from the seed's bundled digest");
  for (const host of hosts)
    for (const [path, status] of expected) {
      const response = await get(worker.origin, host, path);
      // The newsletter host keeps its own unpublished root.
      const want = host === "news.anipotts.com" && path === "/" ? 404 : status;
      const issues = [];
      if (response.status !== want)
        issues.push(`status ${response.status}, expected ${want}`);
      const cache = cacheProblem(path, response);
      if (cache) issues.push(cache);
      if (
        want === 200 &&
        detail.has(path) &&
        response.headers["x-content-sha256"] !== detail.get(path)
      )
        issues.push("not answered from the seeded record");
      report.routes.push({ host, path, status: response.status, issues });
    }
  report.problems = problems;
} finally {
  await stop(worker?.child);
  rmSync(temporary, { recursive: true, force: true });
}
const reportPath = process.argv.includes("--report")
  ? process.argv[process.argv.indexOf("--report") + 1]
  : null;
if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2));
const failing = report.routes.filter((r) => r.issues.length);
for (const r of report.routes)
  console.log(
    `${r.issues.length ? "FAIL" : "ok"} ${r.status} ${r.host}${r.path}${r.issues.length ? ` (${r.issues.join("; ")})` : ""}`,
  );
for (const problem of report.problems) console.log(`FAIL ${problem}`);
console.log(
  `${report.routes.length - failing.length}/${report.routes.length} routes passed; seed ${JSON.stringify(report.seed)}`,
);
if (failing.length || report.problems.length) process.exitCode = 1;
