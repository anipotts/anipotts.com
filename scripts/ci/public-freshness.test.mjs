import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

const turbo = JSON.parse(readFileSync("turbo.json", "utf8"));
assert.ok(
  turbo.tasks["@anipotts/www#build"].inputs.includes(
    "$TURBO_ROOT$/content/public/**",
  ),
  "canonical Markdown outside the app must invalidate the public build cache",
);
const feed = readFileSync("apps/www/src/pages/feed.xml.ts", "utf8");
assert.ok(feed.includes("<lastBuildDate>"));
assert.ok(
  !feed.includes("new Date()"),
  "feed freshness reflects publication, not every request",
);

// Exercise the actual discovery endpoints without Astro's virtual modules.
// Helpers require the same request snapshot; omitting it would silently select
// Git defaults. The built-Worker suite separately proves real inventory reads,
// hidden-record suppression, version headers and database failure behavior.
const ts = createRequire(resolve("apps/www/package.json"))("typescript");
const writing = [
  {
    id: "older",
    data: {
      title: "Older",
      summary: "Earlier publication",
      published_at: new Date("2026-01-01T00:00:00Z"),
    },
    publication: { publishedAt: "2026-09-20T12:00:00Z" },
    body: "CMS body",
  },
  {
    id: "newer",
    data: {
      title: "Newer",
      summary: "Later publication",
      published_at: new Date("2026-02-01T00:00:00Z"),
    },
    body: "Another CMS body",
  },
];
const projects = [
  { id: "project", publication: { publishedAt: "2026-09-19T12:00:00Z" } },
];
async function exercise(file, fail = false) {
  const locals = { request: "synthetic-public-read" };
  const snapshot = { inventoryVersion: 7 };
  let contexts = 0,
    writingReads = 0,
    projectReads = 0;
  const imports = {
    "../lib/content": {
      publicContentContext(input) {
        assert.equal(input, locals, `${file} uses request locals`);
        contexts++;
        return snapshot;
      },
      async publishedWriting(context) {
        assert.equal(
          context,
          snapshot,
          `${file} writing shares its request snapshot`,
        );
        writingReads++;
        if (fail) throw new Error("synthetic publication read failure");
        return writing;
      },
      async visibleProjects(context) {
        assert.equal(
          context,
          snapshot,
          `${file} projects share its request snapshot`,
        );
        projectReads++;
        return projects;
      },
      writingSlug: (record) => record.id,
      projectSlug: (record) => record.id,
    },
    "@anipotts/content/public": {
      siteConfig: {
        url: "https://example.test",
        displayName: "Fixture",
        feedDescription: "Fixture feed",
      },
    },
    "@anipotts/content/public/inline": { inlinePlainText: (value) => value },
    "@astrojs/rss": { default: (options) => options },
  };
  const source = readFileSync(`apps/www/src/pages/${file}`, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const context = {
    exports: {},
    Response,
    require(name) {
      assert.ok(name in imports, `${file} unexpected dependency ${name}`);
      return imports[name];
    },
  };
  runInNewContext(output, context);
  assert.equal(
    context.exports.prerender,
    false,
    `${file} must read current publications per request`,
  );
  if (fail) {
    await assert.rejects(
      context.exports.GET({ locals }),
      /synthetic publication read failure/,
    );
    return;
  }
  const result = await context.exports.GET({ locals });
  assert.equal(contexts, 1, `${file} creates one shared request context`);
  assert.equal(writingReads, 1, `${file} reads published writing once`);
  assert.equal(projectReads, file === "sitemap.xml.ts" ? 1 : 0);
  return result;
}
const rss = await exercise("feed.xml.ts");
assert.match(
  rss.customData,
  /<lastBuildDate>Sun, 01 Feb 2026 00:00:00 GMT<\/lastBuildDate>/,
);
assert.equal(
  rss.items[0].pubDate.getTime(),
  writing[0].data.published_at.getTime(),
  "revisions do not rewrite original publication dates",
);
const sitemap = await (await exercise("sitemap.xml.ts")).text();
assert.match(
  sitemap,
  /\/writing\/older<\/loc><lastmod>2026-09-20T12:00:00Z<\/lastmod>/,
);
assert.match(
  sitemap,
  /\/work\/project<\/loc><lastmod>2026-09-19T12:00:00Z<\/lastmod>/,
);
const search = await (await exercise("search-index.json.ts")).json();
assert.deepEqual(
  search.map((entry) => entry.slug),
  ["older", "newer"],
);
assert.match(search[0].text, /cms body/);
for (const file of ["feed.xml.ts", "sitemap.xml.ts", "search-index.json.ts"])
  await exercise(file, true);
console.log(
  "public freshness: build cache inputs, coherent discovery snapshots, publication dates and failed-read propagation passed",
);
