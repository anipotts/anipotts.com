import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  EDITORIAL_CONTENT_ROOT,
  EDITORIAL_DIRECTORIES,
  listEditorialSources,
} from "@anipotts/content/editorial/layout";

// Vite and Astro compile their glob literals, so the literals cannot import
// the layout table. These pins hold the www literals to it in www's own suite,
// so a www-only edit runs them. Admin pins its literals in
// apps/admin/src/lib/editorial-source-equivalence.test.ts.
const app = new URL("../", import.meta.url);
const root = fileURLToPath(new URL("../../", app));
const walked = listEditorialSources(root, { readdirSync, readFileSync });
const directories = EDITORIAL_DIRECTORIES.map(([directory]) => directory);

const walkedPaths = (directory) =>
  walked
    .filter((file) => file.directory === directory)
    .map((file) => file.path)
    .sort();

// Vite globs and Astro's tinyglobby skip dotfiles; the walker does not.
// Only the two pattern shapes in use are understood, so a new shape fails
// here until this test learns it.
function matched(base, pattern) {
  const directory = fileURLToPath(base);
  if (pattern === "*.md")
    return readdirSync(directory)
      .filter((name) => name.endsWith(".md") && !name.startsWith("."))
      .sort();
  if (/^[\w-]+\.md$/u.test(pattern))
    return existsSync(new URL(pattern, base)) ? [pattern] : [];
  throw new Error(`unsupported glob pattern ${pattern}`);
}

/** The layout directory a base URL names, or undefined outside it. */
function layoutDirectory(base) {
  const path = fileURLToPath(base);
  const prefix = `${root}${EDITORIAL_CONTENT_ROOT}/`;
  const name = path.startsWith(prefix) ? path.slice(prefix.length, -1) : "";
  return directories.includes(name) ? name : undefined;
}

test("the social-card glob reads the walker's writing directory", () => {
  const file = new URL("src/lib/social-card/gate.ts", app);
  const literals = [
    ...readFileSync(file, "utf8").matchAll(
      /import\.meta\.glob\(\s*"([^"]+)"/gu,
    ),
  ].map((match) => match[1]);
  assert.deepEqual(literals, ["../../../../../content/public/writing/*.md"]);
  const literal = literals[0];
  const cut = literal.lastIndexOf("/") + 1;
  const base = new URL(literal.slice(0, cut), file);
  assert.equal(layoutDirectory(base), "writing");
  assert.deepEqual(
    matched(base, literal.slice(cut)).map(
      (name) => `${EDITORIAL_CONTENT_ROOT}/writing/${name}`,
    ),
    walkedPaths("writing"),
  );
});

test("every content collection loader base is a layout directory", () => {
  const text = readFileSync(new URL("src/content.config.ts", app), "utf8");
  const loaders = [
    ...text.matchAll(
      /glob\(\s*\{\s*pattern:\s*"([^"]+)",\s*base:\s*"([^"]+)",?\s*\}\s*\)/gu,
    ),
  ].map(([, pattern, base]) => ({ pattern, base }));
  // A loader this pattern cannot read fails here instead of going unchecked.
  assert.equal(loaders.length, text.match(/\bglob\(/gu)?.length ?? 0);
  assert.ok(loaders.length > 0);
  const read = new Set();
  for (const { pattern, base } of loaders) {
    // Astro resolves a loader base against the project root, not the file.
    const url = new URL(base.endsWith("/") ? base : `${base}/`, app);
    const directory = layoutDirectory(url);
    assert.ok(directory, `${base} is not a content/public layout directory`);
    read.add(directory);
    const paths = matched(url, pattern).map(
      (name) => `${EDITORIAL_CONTENT_ROOT}/${directory}/${name}`,
    );
    assert.ok(paths.length > 0, `${base}/${pattern} matches no file`);
    if (pattern === "*.md") assert.deepEqual(paths, walkedPaths(directory));
    else
      for (const path of paths)
        assert.ok(walkedPaths(directory).includes(path));
  }
  assert.deepEqual([...read].sort(), [...directories].sort());
});
