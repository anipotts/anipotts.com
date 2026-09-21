/** Real local workerd/D1 smoke. No provider account, remote database, queue,
 * production resource ID or outbound integration is present in this config.
 *
 * It also proves the per-record lifecycle end to end against the built
 * Worker: publish, unpublish (a hidden revision), publish again, then restore
 * the database to an export taken before the unpublish, which is the local
 * equivalent of a D1 Time Travel restore to a captured bookmark. */
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
// Local D1 state lives under the default .wrangler/state of this directory,
// so `d1 export --local` (which has no persist flag) reads the same database.
const localState = join(temporary, ".wrangler");
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

function d1(...args) {
  const result = spawnSync(
    process.execPath,
    [cli, "d1", ...args, "--local", "--config", config],
    { cwd: temporary, env, encoding: "utf8", timeout: 60_000 },
  );
  assert.equal(
    result.status,
    0,
    `d1 ${args[0]}: ${result.stderr}\n${result.stdout}`,
  );
}
function execute(name, text) {
  const file = join(temporary, name);
  writeFileSync(file, text);
  d1("execute", "CONTENT_DB", "--file", file);
}
/** One activation, written the way the publisher's CAS batch writes it. */
function activate(name, id, previous, text, revision, version) {
  const digest = createHash("sha256").update(text).digest("hex");
  execute(
    `${name}.sql`,
    `INSERT INTO editorial_published_revisions (publication_id,record_kind,record_id,source,revision,source_sha256,published_at,expected_publication_id,expected_inventory_version,content_schema_version) VALUES ('${id}','writing','awareness-is-alpha',${sqlString(text)},${revision},'${digest}','2026-09-21T12:00:00.000Z','${previous}',${version - 1},1);\nUPDATE editorial_published_active SET publication_id='${id}' WHERE record_kind='writing' AND record_id='awareness-is-alpha';\nUPDATE editorial_published_inventory SET version=${version} WHERE singleton=1;`,
  );
}

let child;
async function startWorker() {
  child = spawn(
    process.execPath,
    [
      cli,
      "dev",
      "--local",
      "--config",
      config,
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
  while (Date.now() < deadline) {
    const origin = output.match(/Ready on (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
    if (origin) return origin;
    if (child.exitCode !== null)
      throw new Error(`local Worker exited: ${output.slice(-6000)}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`local Worker startup timeout: ${output.slice(-6000)}`);
}
async function stopWorker() {
  if (!child || child.exitCode !== null) return;
  process.kill(-child.pid, "SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null) process.kill(-child.pid, "SIGKILL");
}

const DISCOVERY = [
  "/writing",
  "/feed.xml",
  "/sitemap.xml",
  "/search-index.json",
  "/",
];
const NAMED =
  /\/writing\/awareness-is-alpha(?![a-z0-9-])|"slug":"awareness-is-alpha"/u;
const CARD = "/social/writing-awareness-is-alpha.png";

/** The article is public at `version`: detail, card and every discovery route. */
async function assertPublic(origin, version, body) {
  const detail = await fetch(`${origin}/writing/awareness-is-alpha`);
  assert.equal(detail.status, 200);
  assert.equal(detail.headers.get("x-content-version"), String(version));
  assert.match(await detail.text(), body);
  for (const path of DISCOVERY) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("x-content-version"), String(version));
    if (path !== "/") assert.match(await response.text(), NAMED, path);
    else await response.body?.cancel();
  }
  const card = await fetch(`${origin}${CARD}`);
  assert.equal(card.status, 200);
  assert.equal(card.headers.get("content-type"), "image/png");
  // The card follows its article, so it revalidates on every use.
  assert.equal(
    card.headers.get("cache-control"),
    "public, max-age=0, must-revalidate",
  );
  await card.body?.cancel();
}

try {
  execute("fixture.sql", sql);
  let origin = await startWorker();
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
    assert.equal(
      response.headers.get("cache-control"),
      "public, max-age=0, must-revalidate",
      path,
    );
    assert.match(response.headers.get("etag") ?? "", /^"cms1-v1-/u, path);
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
  assert.equal(unknown.headers.get("cache-control"), "no-store");

  // Revalidation and the colo copy under the real runtime and Cache API.
  const article = `${origin}/writing/awareness-is-alpha`;
  const first = await fetch(article);
  const etag = first.headers.get("etag");
  const rendered = await first.text();
  const cached = await fetch(article);
  assert.equal(cached.headers.get("etag"), etag);
  assert.equal(cached.headers.get("x-content-cache"), "hit");
  assert.equal(await cached.text(), rendered);
  const head = await fetch(article, { method: "HEAD" });
  assert.equal(head.headers.get("etag"), etag);
  for (const method of ["GET", "HEAD"]) {
    const revalidated = await fetch(article, {
      method,
      headers: { "if-none-match": etag },
    });
    assert.equal(revalidated.status, 304, method);
    assert.equal(revalidated.headers.get("etag"), etag, method);
  }

  // A publish while the Worker runs is visible on the very next request,
  // whatever validator or colo copy the old version left behind.
  const republished = `${front}\nA second local workerd publication.`;
  activate(
    "publish",
    "workerd-synthetic-2",
    "workerd-synthetic",
    republished,
    2,
    2,
  );
  const after = await fetch(article, { headers: { "if-none-match": etag } });
  assert.equal(after.status, 200);
  assert.equal(after.headers.get("x-content-version"), "2");
  assert.notEqual(after.headers.get("etag"), etag);
  assert.equal(after.headers.get("x-content-cache"), "miss");
  assert.match(await after.text(), /A second local workerd publication/);
  await assertPublic(origin, 2, /A second local workerd publication/);

  // Bookmark-equivalent capture before the visibility change.
  const bookmark = join(temporary, "bookmark.sql");
  d1("export", "CONTENT_DB", "--output", bookmark);

  // Warm every discovery copy at v2, so a stale validator or colo entry
  // would have something to answer with after the unpublish.
  const warmed = new Map();
  for (const path of [...DISCOVERY, "/writing/awareness-is-alpha"]) {
    const response = await fetch(`${origin}${path}`);
    warmed.set(path, response.headers.get("etag"));
    await response.body?.cancel();
  }

  // Unpublish: a new immutable revision with only its visibility off.
  const hidden = republished.replace(/^status: published$/mu, "status: draft");
  assert.notEqual(hidden, republished);
  activate(
    "unpublish",
    "workerd-synthetic-3",
    "workerd-synthetic-2",
    hidden,
    3,
    3,
  );
  const gone = await fetch(article, {
    headers: { "if-none-match": warmed.get("/writing/awareness-is-alpha") },
  });
  assert.equal(gone.status, 404);
  assert.equal(gone.headers.get("x-content-version"), "3");
  assert.equal(gone.headers.get("cache-control"), "no-store");
  assert.equal(gone.headers.get("etag"), null);
  await gone.body?.cancel();
  for (const path of DISCOVERY) {
    const response = await fetch(`${origin}${path}`, {
      headers: { "if-none-match": warmed.get(path) },
    });
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("x-content-version"), "3", path);
    assert.match(response.headers.get("etag") ?? "", /^"cms1-v3-/u, path);
    assert.doesNotMatch(await response.text(), NAMED, path);
  }
  const hiddenCard = await fetch(`${origin}${CARD}`);
  assert.equal(hiddenCard.status, 404);
  assert.equal(hiddenCard.headers.get("x-content-version"), "3");
  assert.equal(hiddenCard.headers.get("cache-control"), "no-store");
  await hiddenCard.body?.cancel();
  // Another article's card is unaffected.
  const otherCard = await fetch(
    `${origin}/social/writing-saturdays-are-for-claude-code.png`,
  );
  assert.equal(otherCard.status, 200);
  await otherCard.body?.cancel();
  const hiddenProof = await (
    await fetch(
      `${origin}/api/content-version?kind=writing&id=awareness-is-alpha`,
    )
  ).json();
  assert.equal(hiddenProof.inventoryVersion, 3);
  assert.equal(hiddenProof.visible, false);
  assert.equal(hiddenProof.publicationId, undefined);

  // Publish again: the next revision, visible, through the same activation.
  activate(
    "republish",
    "workerd-synthetic-4",
    "workerd-synthetic-3",
    republished,
    4,
    4,
  );
  await assertPublic(origin, 4, /A second local workerd publication/);

  // Restore to the captured state: replace the database from the export,
  // as a Time Travel restore replaces it in place, and start the reader.
  await stopWorker();
  rmSync(join(localState, "state", "v3", "d1"), {
    recursive: true,
    force: true,
  });
  d1("execute", "CONTENT_DB", "--file", bookmark);
  origin = await startWorker();
  const restored = await (
    await fetch(
      `${origin}/api/content-version?kind=writing&id=awareness-is-alpha`,
    )
  ).json();
  assert.equal(restored.inventoryVersion, 2);
  assert.equal(
    restored.sourceSha256,
    createHash("sha256").update(republished).digest("hex"),
  );
  await assertPublic(origin, 2, /A second local workerd publication/);
  console.log(
    "Real local workerd + D1: runtime CMS Markdown, sanitization, coherent version headers, discovery, proof, private-media denial, 304 revalidation, colo copy, publish freshness, unpublish (detail and card 404, absent from discovery at the new version), publish again and restore from an export bookmark passed.",
  );
} finally {
  await stopWorker();
  rmSync(temporary, { recursive: true, force: true });
}
