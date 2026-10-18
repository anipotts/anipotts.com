import assert from "node:assert/strict";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  EDITORIAL_CONTENT_ROOT,
  EDITORIAL_DIRECTORIES,
  listEditorialSources,
} from "../../../packages/content/src/editorial/layout.ts";

const app = new URL("../", import.meta.url);
const root = fileURLToPath(new URL("../../", app));

test("public collection loaders cover the editorial layout without other roots", () => {
  const source = fs.readFileSync(new URL("src/content.config.ts", app), "utf8");
  const loaders = [
    ...source.matchAll(
      /glob\(\s*\{\s*pattern:\s*"([^"]+)",\s*base:\s*"([^"]+)",?\s*\}\s*\)/gu,
    ),
  ];
  assert.ok(loaders.length > 0);
  assert.equal(loaders.length, source.match(/\bglob\(/gu)?.length ?? 0);
  const walked = listEditorialSources(root, fs);
  const seen = new Set();
  for (const [, pattern, base] of loaders) {
    const directory = EDITORIAL_DIRECTORIES.find(
      ([name]) =>
        fileURLToPath(new URL(`${base.replace(/\/$/u, "")}/`, app)) ===
        `${root}${EDITORIAL_CONTENT_ROOT}/${name}/`,
    )?.[0];
    assert.ok(directory, `unexpected collection root: ${base}`);
    seen.add(directory);
    const entries = walked.filter((entry) => entry.directory === directory);
    if (pattern === "*.md") {
      assert.ok(entries.length > 0);
      assert.ok(
        entries.every((entry) => !entry.id.startsWith(".")),
        "Astro omits dotfiles",
      );
    } else {
      assert.match(pattern, /^[\w-]+\.md$/u);
      assert.ok(
        entries.some((entry) => entry.path.endsWith(`/${pattern}`)),
        `missing collection source: ${pattern}`,
      );
    }
  }
  assert.deepEqual(
    [...seen].sort(),
    EDITORIAL_DIRECTORIES.map(([name]) => name).sort(),
  );
});

test("public social-card availability stays in the active CMS inventory", () => {
  const gate = fs.readFileSync(
    new URL("src/lib/social-card/gate.ts", app),
    "utf8",
  );
  assert.doesNotMatch(gate, /import\.meta\.glob|bundledWritingSources/u);
  assert.match(gate, /await getPublishedInventory\(db\)/u);
  assert.match(gate, /publicWritingSlugs\(publications\)\.has\(slug\)/u);
});
