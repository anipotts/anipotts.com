/** Real local workerd/D1 smoke. No provider account, remote database, queue,
 * production resource ID or outbound integration is present in this config. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "www-cms-workerd-"));
const cli = join(
  dirname(createRequire(import.meta.url).resolve("wrangler/package.json")),
  "bin/wrangler.js",
);
const config = join(temporary, "wrangler.json");
const state = join(temporary, "state");
const env = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" };
writeFileSync(
  config,
  JSON.stringify({
    name: "cms-reader-local-proof",
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
        database_name: "synthetic-content",
        database_id: "00000000-0000-0000-0000-000000000001",
      },
    ],
  }),
);
const original = readFileSync(
  join(root, "content/public/writing/awareness-is-alpha.md"),
  "utf8",
);
const front = original.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)[0];
const source = `${front}\nA local workerd CMS publication. **Verified bold.**\n\n<script>privateUnsafe()</script>`;
const hash = createHash("sha256").update(source).digest("hex");
const sqlString = (value) => `'${value.replaceAll("'", "''")}'`;
const sql =
  ["0001_published_snapshots.sql", "0002_content_schema_version.sql"]
    .map((name) =>
      readFileSync(
        join(root, "apps/admin/migrations/content-publication", name),
        "utf8",
      ),
    )
    .join("\n") +
  `\nINSERT INTO editorial_published_revisions (publication_id,record_kind,record_id,source,revision,source_sha256,published_at,expected_inventory_version,content_schema_version) VALUES ('workerd-synthetic','writing','awareness-is-alpha',${sqlString(source)},1,'${hash}','2026-09-20T12:00:00.000Z',0,1);\nINSERT INTO editorial_published_active VALUES ('writing','awareness-is-alpha','workerd-synthetic');\nUPDATE editorial_published_inventory SET version=1 WHERE singleton=1;`;
const fixture = join(temporary, "fixture.sql");
writeFileSync(fixture, sql);
let child;
try {
  const setup = spawnSync(
    process.execPath,
    [
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
      fixture,
    ],
    { cwd: temporary, env, encoding: "utf8", timeout: 60_000 },
  );
  assert.equal(
    setup.status,
    0,
    `local D1 setup: ${setup.stderr}\n${setup.stdout}`,
  );
  child = spawn(
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
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  const deadline = Date.now() + 45_000;
  let origin;
  while (Date.now() < deadline) {
    origin = output.match(/Ready on (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
    if (origin) break;
    if (child.exitCode !== null)
      throw new Error(`local Worker exited: ${output.slice(-6000)}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(origin, `local Worker startup timeout: ${output.slice(-6000)}`);
  const proof = await fetch(
    `${origin}/api/content-version?kind=writing&id=awareness-is-alpha`,
  );
  assert.equal(proof.status, 200, await proof.clone().text());
  const receipt = await proof.json();
  assert.equal(receipt.sourceSha256, hash);
  assert.equal(receipt.inventoryVersion, 1);
  assert.match(receipt.bundledSourceSha256, /^[a-f0-9]{64}$/);
  for (const path of [
    "/writing/awareness-is-alpha",
    "/writing",
    "/feed.xml",
    "/sitemap.xml",
    "/search-index.json",
    "/",
  ]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(
      response.status,
      200,
      `${path}: ${await response.clone().text()}`,
    );
    assert.equal(response.headers.get("x-content-version"), "1", path);
    assert.equal(response.headers.get("cache-control"), "no-store", path);
    if (path === "/writing/awareness-is-alpha") {
      const html = await response.text();
      assert.match(html, /A local workerd CMS publication/);
      assert.match(html, /<strong>Verified bold\.<\/strong>/);
      assert.doesNotMatch(html, /<script>privateUnsafe/);
    }
  }
  const unknown = await fetch(
    `${origin}/images/editorial/${"a".repeat(64)}.png`,
  );
  assert.equal(unknown.status, 404);
  console.log(
    "Real local workerd + D1: runtime CMS Markdown, sanitization, coherent version headers, discovery, proof and private-media denial passed.",
  );
} finally {
  if (child && child.exitCode === null) {
    process.kill(-child.pid, "SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (child.exitCode === null) process.kill(-child.pid, "SIGKILL");
  }
  rmSync(temporary, { recursive: true, force: true });
}
