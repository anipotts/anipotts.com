import assert from "node:assert/strict";
import test from "node:test";
import { builtPages, clientScripts, startTags } from "./built-html.mjs";

// Run after the www build; verify emitted markup rather than source spelling.
const pages = builtPages();

// ARIA 1.2 roles that prohibit author naming, so assistive technology ignores aria-label.
const unnamedRoles = new Set([
  "caption",
  "code",
  "deletion",
  "emphasis",
  "generic",
  "insertion",
  "none",
  "paragraph",
  "presentation",
  "strong",
  "subscript",
  "superscript",
]);
const implicitRoles = {
  b: "generic",
  bdi: "generic",
  bdo: "generic",
  code: "code",
  data: "generic",
  del: "deletion",
  div: "generic",
  em: "emphasis",
  i: "generic",
  ins: "insertion",
  p: "paragraph",
  pre: "generic",
  q: "generic",
  s: "deletion",
  samp: "generic",
  small: "generic",
  span: "generic",
  strong: "strong",
  sub: "subscript",
  sup: "superscript",
  u: "generic",
};
const role = ({ name, attributes }) =>
  attributes.role?.trim().split(/\s+/)[0] ??
  (name === "a" && !("href" in attributes) ? "generic" : implicitRoles[name]);
const idReferences = [
  "aria-activedescendant",
  "aria-controls",
  "aria-describedby",
  "aria-details",
  "aria-errormessage",
  "aria-flowto",
  "aria-labelledby",
  "aria-owns",
];

test("the scan covers the public pages", () => {
  for (const path of ["/index.html", "/systems.html", "/work.html"])
    assert.ok(
      pages.some((page) => page.path === path),
      `missing built page ${path}`,
    );
});

test("aria-label and aria-labelledby only name roles that accept a name", () => {
  const ignored = pages.flatMap(({ path, html }) =>
    startTags(html)
      .filter(
        (tag) =>
          ("aria-label" in tag.attributes ||
            "aria-labelledby" in tag.attributes) &&
          unnamedRoles.has(role(tag)),
      )
      .map((tag) => `${path}: ${tag.source}`),
  );
  assert.deepEqual(ignored, []);
});

test("aria id references resolve within the page", () => {
  const dangling = pages.flatMap(({ path, html }) => {
    const tags = startTags(html);
    const ids = new Set(tags.map((tag) => tag.attributes.id).filter(Boolean));
    return tags.flatMap((tag) =>
      idReferences.flatMap((name) =>
        (tag.attributes[name] ?? "")
          .split(/\s+/)
          .filter((id) => id && !ids.has(id))
          .map((id) => `${path}: ${name}="${id}" in ${tag.source}`),
      ),
    );
  });
  assert.deepEqual(dangling, []);
});

test("toggles keep a static name while aria state carries the change", () => {
  for (const { path, html } of pages) {
    const toggles = startTags(html).filter(
      ({ attributes }) =>
        "aria-pressed" in attributes || "aria-expanded" in attributes,
    );
    if (!toggles.length) continue;
    for (const script of clientScripts(html))
      assert.equal(
        /setAttribute\(\s*["'`]aria-label["'`]|\.ariaLabel\s*=/.test(script),
        false,
        `${path}: a client script rewrites an accessible name`,
      );
  }
});

test("the theme toggle name says what its pressed state means", () => {
  for (const { path, html } of pages) {
    const toggle = startTags(html).find(
      ({ attributes }) => attributes.id === "theme-toggle",
    );
    if (!toggle) continue;
    assert.equal(toggle.attributes["aria-pressed"], "false", path);
    assert.match(
      toggle.attributes["aria-label"] ?? "",
      /\bdark\b/,
      `${path}: aria-pressed reports the dark theme, so the name must name it`,
    );
  }
});
