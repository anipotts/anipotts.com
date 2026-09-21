import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parse, stringify } from "yaml";
import {
  serve,
  fileAssets,
  renderedDir,
  workerWithManifestAssets,
  executionContext,
} from "./worker-runtime.mjs";

// Actual emitted Astro/Worker rendering with a synthetic SQLite D1 adapter.
// This proves read/query/render integration, not provider D1 transaction semantics.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const source = (kind, id) =>
  readFileSync(join(root, "content/public", kind, `${id}.md`), "utf8");
const original = source("writing", "awareness-is-alpha");
const hash = (text) => createHash("sha256").update(text).digest("hex");
const bundledSourceSha256 = hash(
  JSON.stringify(
    ["pages", "projects", "writing"]
      .flatMap((directory) =>
        readdirSync(join(root, "content/public", directory))
          .filter(
            (file) =>
              file.endsWith(".md") &&
              (directory !== "pages" ||
                [
                  "home.md",
                  "work.md",
                  "writing.md",
                  "systems.md",
                  "newsletter.md",
                ].includes(file)),
          )
          .map((file) => {
            const path = `content/public/${directory}/${file}`;
            return [path, readFileSync(join(root, path), "utf8")];
          }),
      )
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  ),
);
function edit(raw, fields, body) {
  const front = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return `---\n${stringify({ ...parse(front[1]), ...fields })}---\n${body ?? raw.slice(front[0].length)}`;
}
function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of [
    "0001_published_snapshots.sql",
    "0002_content_schema_version.sql",
  ])
    sqlite.exec(
      readFileSync(
        join(root, "apps/admin/migrations/content-publication", name),
        "utf8",
      ),
    );
  let reads = 0;
  const db = {
    get reads() {
      return reads;
    },
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...args) {
          values = args;
          return statement;
        },
        async first() {
          return sqlite.prepare(sql).get(...values) ?? null;
        },
        async all() {
          return { success: true, results: sqlite.prepare(sql).all(...values) };
        },
      };
      return statement;
    },
    async batch(statements) {
      reads++;
      sqlite.exec("BEGIN");
      try {
        const result = await Promise.all(
          statements.map((statement) => statement.all()),
        );
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    publish({
      kind = "writing",
      id = "awareness-is-alpha",
      text = original,
      schema = 1,
      digest = hash(text),
      operation = `synthetic-${kind}-${id}-${sqlite.prepare("SELECT version FROM editorial_published_inventory").get().version}`,
    } = {}) {
      const version = sqlite
        .prepare(
          "SELECT version FROM editorial_published_inventory WHERE singleton=1",
        )
        .get().version;
      sqlite
        .prepare(
          `INSERT INTO editorial_published_revisions (publication_id,record_kind,record_id,source,revision,source_sha256,published_at,expected_publication_id,expected_inventory_version,content_schema_version) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          operation,
          kind,
          id,
          text,
          1,
          digest,
          "2026-09-20T12:00:00.000Z",
          null,
          version,
          schema,
        );
      sqlite
        .prepare(
          "INSERT INTO editorial_published_active VALUES (?,?,?) ON CONFLICT(record_kind,record_id) DO UPDATE SET publication_id=excluded.publication_id",
        )
        .run(kind, id, operation);
      sqlite.exec(
        "UPDATE editorial_published_inventory SET version=version+1 WHERE singleton=1",
      );
      return { operation, digest, version: version + 1 };
    },
    close() {
      sqlite.close();
    },
  };
  return db;
}
const cms = (db, other = {}) => ({
  CONTENT_RUNTIME: "cms",
  CONTENT_DB: db,
  ...other,
});
const staleAssets = fileAssets(renderedDir);
const paths = [
  "/",
  "/writing",
  "/work",
  "/systems",
  "/writing/awareness-is-alpha",
  "/work/chainedchat",
  "/feed.xml",
  "/search-index.json",
  "/sitemap.xml",
  "/api/content-version",
];

function version(response, expected) {
  assert.equal(response.headers.get("x-content-version"), String(expected));
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("cdn-cache-control"), "no-store");
  assert.equal(
    response.headers.get("cloudflare-cdn-cache-control"),
    "no-store",
  );
}

test("activated CMS fails closed without its database, even with old asset responses", async () => {
  for (const path of paths) {
    const response = await serve(path, cms(undefined, { ASSETS: staleAssets }));
    assert.equal(response.status, 503, path);
    assert.equal(await response.text(), "Content unavailable", path);
    assert.equal(response.headers.get("cache-control"), "no-store", path);
  }
});

test("unknown and null runtime modes fail closed even when the database is healthy", async () => {
  const db = database();
  try {
    for (const CONTENT_RUNTIME of [null, "CMS", "disabled", "", false]) {
      for (const path of [
        "/",
        "/writing/awareness-is-alpha",
        "/api/content-version",
      ]) {
        const response = await serve(path, {
          ...cms(db),
          CONTENT_RUNTIME,
          ASSETS: staleAssets,
        });
        assert.equal(response.status, 503, `${CONTENT_RUNTIME} ${path}`);
        assert.equal(await response.text(), "Content unavailable");
      }
    }
    assert.equal(db.reads, 0);
  } finally {
    db.close();
  }
});

test("one coherent read per request drives pages and discovery immediately", async () => {
  const db = database();
  try {
    const text = edit(
      original,
      {
        title: "CMS runtime title",
        summary: "CMS subtitle updated without deployment",
      },
      "CMS body marker.\n\n<script>alert('unsafe')</script>\n\n**still bold**",
    );
    const receipt = db.publish({ text });
    for (const path of paths) {
      const before = db.reads;
      const response = await serve(path, cms(db, { ASSETS: staleAssets }));
      assert.equal(response.status, 200, path);
      version(response, 1);
      assert.equal(db.reads - before, 1, `${path} reads one atomic inventory`);
      const result = await response.text();
      if (
        [
          "/writing",
          "/writing/awareness-is-alpha",
          "/feed.xml",
          "/search-index.json",
        ].includes(path)
      ) {
        assert.match(result, /CMS runtime title/, path);
        assert.match(result, /CMS subtitle updated without deployment/, path);
      }
      if (path === "/writing/awareness-is-alpha") {
        assert.match(result, /CMS body marker/);
        assert.match(result, /<strong>still bold<\/strong>/);
        assert.doesNotMatch(result, /<script>alert/);
        assert.match(result, /\/social\/site\.png/);
        assert.equal(response.headers.get("x-content-sha256"), receipt.digest);
      }
    }
    const proof = await serve(
      "/api/content-version?kind=writing&id=awareness-is-alpha",
      cms(db),
    );
    assert.deepEqual(await proof.json(), {
      runtime: 1,
      contentSchemaVersion: 1,
      inventoryVersion: 1,
      bundledSourceSha256,
      visible: true,
      publicationId: receipt.operation,
      sourceSha256: receipt.digest,
    });
  } finally {
    db.close();
  }
});

test("unpublication suppresses Git detail, listings, homepage, discovery and private proof", async () => {
  const db = database();
  try {
    db.publish({ text: edit(original, { status: "draft" }) });
    const response = await serve(
      "/writing/awareness-is-alpha",
      cms(db, { ASSETS: staleAssets }),
    );
    assert.equal(response.status, 404);
    version(response, 1);
    for (const path of [
      "/",
      "/writing",
      "/feed.xml",
      "/search-index.json",
      "/sitemap.xml",
    ]) {
      const response = await serve(path, cms(db, { ASSETS: staleAssets }));
      assert.equal(response.status, 200, path);
      assert.doesNotMatch(
        await response.text(),
        /\/writing\/awareness-is-alpha|"slug":"awareness-is-alpha"/,
        path,
      );
    }
    for (const id of ["awareness-is-alpha", "not-a-publication"]) {
      const proof = await serve(
        `/api/content-version?kind=writing&id=${id}`,
        cms(db),
      );
      assert.deepEqual(await proof.json(), {
        runtime: 1,
        contentSchemaVersion: 1,
        inventoryVersion: 1,
        bundledSourceSha256,
        visible: false,
      });
    }
  } finally {
    db.close();
  }
});

test("visible and hidden project records overlay before public-state filtering", async () => {
  const db = database();
  try {
    const project = source("projects", "chainedchat");
    db.publish({
      kind: "work",
      id: "chainedchat",
      text: edit(project, { card_copy: "CMS project subtitle" }),
    });
    let response = await serve("/work/chainedchat", cms(db));
    assert.equal(response.status, 200);
    assert.match(await response.text(), /CMS project subtitle/);
    db.publish({
      kind: "work",
      id: "chainedchat",
      text: edit(project, { public_state: "hidden" }),
    });
    response = await serve(
      "/work/chainedchat",
      cms(db, { ASSETS: staleAssets }),
    );
    assert.equal(response.status, 404);
    assert.doesNotMatch(
      await (await serve("/work", cms(db))).text(),
      /href="\/work\/chainedchat"/,
    );
  } finally {
    db.close();
  }
});

test("page overrides and a new CMS article render without bundled content or code changes", async () => {
  const db = database();
  try {
    const home = source("pages", "home").replace(
      "hi, i'm ani!",
      "CMS home heading",
    );
    db.publish({ kind: "page", id: "home", text: home });
    db.publish({
      id: "synthetic-new-article",
      text: edit(
        original,
        { slug: "synthetic-new-article", title: "New CMS article" },
        "A new article body.",
      ),
    });
    const page = await serve("/", cms(db));
    assert.match(await page.text(), /CMS home heading/);
    const article = await serve("/writing/synthetic-new-article", cms(db));
    assert.equal(article.status, 200);
    assert.match(await article.text(), /A new article body/);
    version(article, 2);
  } finally {
    db.close();
  }
});

test("invalid schema, source, hash and storage errors never resurrect Git content", async () => {
  for (const invalid of [
    { schema: 2 },
    { digest: "0".repeat(64) },
    { text: "invalid source" },
  ]) {
    const db = database();
    try {
      db.publish(invalid);
      for (const path of [
        "/writing/awareness-is-alpha",
        "/feed.xml",
        "/api/content-version",
      ]) {
        const response = await serve(path, cms(db, { ASSETS: staleAssets }));
        assert.equal(response.status, 503);
        assert.equal(await response.text(), "Content unavailable");
      }
    } finally {
      db.close();
    }
  }
  const response = await serve(
    "/",
    cms(
      {
        prepare() {
          throw Error("private provider failure");
        },
      },
      { ASSETS: staleAssets },
    ),
  );
  assert.equal(response.status, 503);
  assert.equal(await response.text(), "Content unavailable");
});

test("route collisions reject rendering instead of choosing an arbitrary record", async () => {
  const db = database();
  try {
    db.publish({ id: "synthetic-collision", text: original });
    const response = await serve("/writing/awareness-is-alpha", cms(db));
    assert.equal(response.status, 503);
  } finally {
    db.close();
  }
});

test("media requires an active visible reference before either asset or bucket access", async () => {
  const db = database();
  const id = `${"a".repeat(64)}.png`;
  const path = `/images/editorial/${id}`;
  let gets = 0,
    assetReads = 0;
  const env = cms(db, {
    ASSETS: {
      async fetch() {
        assetReads++;
        return new Response(null, { status: 404 });
      },
    },
    CONTENT_MEDIA: {
      async get(key) {
        gets++;
        assert.equal(key, id);
        return { body: new Uint8Array([1, 2, 3]), size: 3 };
      },
    },
  });
  try {
    assert.equal((await serve(path, env)).status, 404);
    assert.equal(gets + assetReads, 0, "unknown asset never reaches storage");
    db.publish({ text: edit(original, {}, `![Fixture image](${path})`) });
    let response = await serve(path, env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    version(response, 1);
    assert.deepEqual(
      [...new Uint8Array(await response.arrayBuffer())],
      [1, 2, 3],
    );
    assert.equal(
      (await serve(path, { ...env, CONTENT_MEDIA: undefined })).status,
      503,
    );
    db.publish({
      text: edit(original, { status: "draft" }, `![Fixture image](${path})`),
    });
    const before = gets + assetReads;
    response = await serve(path, env);
    assert.equal(response.status, 404);
    assert.equal(
      gets + assetReads,
      before,
      "hidden and historical references never reach storage",
    );
  } finally {
    db.close();
  }
});

test("the adapter manifest cannot expose an old bundled editorial image", async () => {
  const db = database();
  const path = `/images/editorial/${"c".repeat(64)}.png`;
  const fixtureWorker = await workerWithManifestAssets([path]);
  let reads = 0;
  try {
    const response = await fixtureWorker.fetch(
      new Request(`https://anipotts.com${path}`),
      cms(db, {
        ASSETS: {
          async fetch() {
            reads++;
            return new Response("previously public bytes");
          },
        },
      }),
      executionContext,
    );
    assert.equal(response.status, 404);
    assert.equal(reads, 0);
  } finally {
    db.close();
  }
});

test("Markdown text mentioning a private image is not a public media reference", async () => {
  const db = database();
  const path = `/images/editorial/${"b".repeat(64)}.png`;
  try {
    db.publish({
      text: edit(
        original,
        {},
        `\`![private](${path})\`\n\n<!-- ![private](${path}) -->`,
      ),
    });
    assert.equal((await serve(path, cms(db))).status, 404);
  } finally {
    db.close();
  }
});

test("legacy/default mode still renders Git; old HTML aliases cannot bypass CMS authority", async () => {
  const db = database();
  try {
    db.publish({
      text: edit(original, { title: "CMS hidden from legacy mode" }),
    });
    for (const CONTENT_RUNTIME of [undefined, "legacy"]) {
      const response = await serve("/writing/awareness-is-alpha", {
        CONTENT_DB: db,
        CONTENT_RUNTIME,
      });
      assert.equal(response.status, 200);
      assert.doesNotMatch(await response.text(), /CMS hidden from legacy mode/);
    }
    assert.equal(db.reads, 0);
    assert.equal((await serve("/api/content-version")).status, 503);
    for (const [path, target] of [
      ["/index.html", "/"],
      ["/writing.html", "/writing"],
      ["/writing/awareness-is-alpha.html", "/writing/awareness-is-alpha"],
    ]) {
      const response = await serve(path, cms(db, { ASSETS: staleAssets }));
      assert.equal(response.status, 308);
      assert.equal(
        response.headers.get("location"),
        `https://anipotts.com${target}`,
      );
    }
  } finally {
    db.close();
  }
});

test("encoded CMS paths cannot bypass publication guards through ASSETS", async () => {
  let reads = 0;
  const env = {
    CONTENT_RUNTIME: "cms",
    ASSETS: {
      async fetch() {
        reads++;
        return new Response("obsolete bundled bytes");
      },
    },
  };
  const id = `${"a".repeat(64)}.png`;
  for (const [path, canonical] of [
    [`/images/%65ditorial/${id}`, `/images/editorial/${id}`],
    ["/%77riting/awareness-is-alpha", "/writing/awareness-is-alpha"],
    ["/%69ndex.html", "/index.html"],
  ]) {
    const response = await serve(path, env);
    assert.equal(response.status, 308);
    assert.equal(new URL(response.headers.get("location")).pathname, canonical);
    // Follow the canonical route, including the existing HTML alias redirect.
    let target = await serve(canonical, env);
    if (target.status === 308)
      target = await serve(
        new URL(target.headers.get("location")).pathname,
        env,
      );
    assert.equal(target.status, 503);
  }
  for (const path of [
    `/images%2Feditorial%2F${id}`,
    `/images/%2565ditorial/${id}`,
    "/writing/%ZZ",
    "/images/%5ceditorial/test.png",
    "/writing/%00",
  ])
    assert.equal((await serve(path, env)).status, 400);
  assert.equal(reads, 0);
});
