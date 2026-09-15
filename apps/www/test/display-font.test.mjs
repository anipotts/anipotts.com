import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { builtPages, dist, startTags } from "./built-html.mjs";

// Run after the www build; the display face must be fetched with the document
// and must swap in over a stand-in that keeps the headline width.
const pages = builtPages();
const css = readdirSync(join(dist, "_astro"))
  .filter((file) => file.endsWith(".css"))
  .map((file) => readFileSync(join(dist, "_astro", file), "utf8"))
  .join("\n");

const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(
  ([, body]) => ({
    family: /font-family:\s*["']?([^;"']+)/.exec(body)?.[1].trim(),
    body,
  }),
);

test("the AP Structural face is preloaded with the exact url it requests", () => {
  const display = faces.filter((face) => face.family === "AP Structural");
  assert.equal(display.length, 1, "one AP Structural @font-face in built css");
  const src = /url\(["']?([^)"']+\.woff2)["']?\)/.exec(display[0].body)?.[1];
  assert.ok(src, "AP Structural @font-face has a woff2 src");
  assert.ok(existsSync(join(dist, src)), `${src} is emitted`);

  for (const { path, html } of pages) {
    const preloads = startTags(html).filter(
      ({ name, attributes }) =>
        name === "link" &&
        attributes.rel === "preload" &&
        attributes.as === "font",
    );
    assert.deepEqual(
      preloads.map(({ attributes }) => attributes.href),
      [src],
      `${path} preloads only the display face, at its @font-face src`,
    );
    const [{ attributes }] = preloads;
    assert.equal(attributes.type, "font/woff2", `${path} preload type`);
    assert.ok("crossorigin" in attributes, `${path} preload is crossorigin`);
  }
});

test("the display stack falls back to metric-matched local faces first", () => {
  const stack = /--font-display:\s*([^;}]+)/.exec(css)?.[1];
  assert.ok(stack, "--font-display is in built css");
  const families = stack
    .split(",")
    .map((part) => part.trim().replace(/"/g, ""));
  assert.deepEqual(families.slice(0, 3), [
    "AP Structural",
    "AP Structural Fallback",
    "AP Structural Fallback Neue",
  ]);

  for (const family of families.slice(1, 3)) {
    const face = faces.find((candidate) => candidate.family === family);
    assert.ok(face, `${family} @font-face is in built css`);
    assert.match(face.body, /src:\s*local\(/, `${family} is a local face`);
    assert.doesNotMatch(face.body, /url\(/, `${family} downloads nothing`);
    for (const descriptor of [
      "size-adjust",
      "ascent-override",
      "descent-override",
      "line-gap-override",
    ])
      assert.match(
        face.body,
        new RegExp(`${descriptor}:\\s*[\\d.]+%`),
        `${family} sets ${descriptor}`,
      );
  }
});
