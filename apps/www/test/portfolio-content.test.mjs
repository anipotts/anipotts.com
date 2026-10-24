import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { builtPages, dist, readableText } from "./built-html.mjs";

function pageText(path) {
  return readableText(readFileSync(join(dist, path), "utf8"));
}

test("portfolio text extraction skips raw text and comments without rewriting markup", () => {
  assert.equal(
    readableText(
      "<script>ignored <script>body</script><!-- hidden --><style>ignored</style><p>past <strong>experience</strong> &amp; work</p>",
    ),
    "past experience & work",
  );
});

test("legacy ClaudeMon is absent from public pages and discovery", () => {
  const slug = "i-built-a-monitor-for-my-claude-code-sessions";
  assert.equal(existsSync(join(dist, `writing/${slug}.html`)), false);
  for (const { path, html } of builtPages()) {
    assert.ok(!html.includes(slug), `${path} links the hidden legacy monitor`);
  }
  for (const path of ["feed.xml", "sitemap.xml", "search-index.json"]) {
    assert.ok(!readFileSync(join(dist, path), "utf8").includes(slug), path);
  }
});

test("current ClaudeMon presents the changelog API and source freshness", () => {
  const text = pageText("work/claudemon.html");
  assert.match(text, /public JSON API/);
  assert.match(text, /source freshness/);
  assert.doesNotMatch(
    text,
    /Claude Code sessions|session-monitoring|desktop monitor/i,
  );
});

test("professional experience keeps its dates and never inherits archived project labeling", () => {
  const text = pageText("work/structured-ai.html");
  assert.match(text, /Full Stack Product Engineer/);
  assert.match(text, /February 2026.*April 2026/);
  assert.match(text, /past experience/);
  assert.doesNotMatch(text, /Status:\s*archived/);
  assert.match(pageText("work/chainedchat.html"), /Status:\s*archived/);
});

test("Range Media is past work with no invented dates or current label", () => {
  const text = pageText("work/range-media-partners.html");
  assert.match(text, /past experience/);
  assert.doesNotMatch(text, /Timeframe:|Status:\s*in progress|\bcurrent\b/);
});

test("Paragon records the supported end date without guessing a start", () => {
  const text = pageText("work/pgi-research-platform.html");
  assert.match(text, /Ended March 2026/);
  assert.doesNotMatch(text, /2025\s*[–-]\s*present/);
});
