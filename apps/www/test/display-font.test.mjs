import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { builtPages, dist, startTags } from "./built-html.mjs";

// Run after the www build; the display face swaps in over a local stand-in
// that keeps the headline width, and it is never preloaded (a preload delays
// Chromium first paint on a slow connection, measured at 64 to 108ms).
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

test("no font is preloaded, so nothing blocks first paint", () => {
  for (const { path, html } of pages) {
    const preloads = startTags(html).filter(
      ({ name, attributes }) =>
        name === "link" &&
        attributes.rel === "preload" &&
        attributes.as === "font",
    );
    assert.deepEqual(
      preloads.map(({ attributes }) => attributes.href),
      [],
      `${path} preloads no font`,
    );
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

    // AP Structural is 1900 ascent and 500 descent on a 2000 unit em, so the
    // vertical overrides must stay those metrics divided by size-adjust.
    const percent = (descriptor) =>
      Number(new RegExp(`${descriptor}:\\s*([\\d.]+)%`).exec(face.body)[1]);
    const size = percent("size-adjust") / 100;
    assert.ok(
      Math.abs(percent("ascent-override") - 95 / size) < 0.1,
      `${family} ascent-override matches AP Structural at its size-adjust`,
    );
    assert.ok(
      Math.abs(percent("descent-override") - 25 / size) < 0.1,
      `${family} descent-override matches AP Structural at its size-adjust`,
    );
  }
});
