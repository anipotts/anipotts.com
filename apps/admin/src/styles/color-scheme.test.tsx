// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Theme } from "@astryxdesign/core/theme";
import { describe, expect, it } from "vitest";
import { editorialTheme } from "../themes/editorial.js";

// The light-mode flash: with the preference only in storage, the server
// renders Astryx's Theme wrapper in system mode, and its own color-scheme
// class painted the page dark under a dark OS until hydration, although the
// prepaint had already made the root light. The root is the one authority.
// jsdom serves modules over http, so files are read from the package.
const shell = readFileSync(join(process.cwd(), "src/styles/shell.css"), "utf8");
const astryx = readFileSync(
  createRequire(join(process.cwd(), "package.json")).resolve(
    "@astryxdesign/core/astryx.css",
  ),
  "utf8",
);
const uncommented = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Each top-level rule's selector, body and whether it sits in a layer. */
function rules(css: string) {
  const found: { selector: string; body: string; layered: boolean }[] = [];
  const stack: string[] = [];
  let buffer = "";
  for (const char of uncommented(css)) {
    if (char === "{") {
      stack.push(buffer.trim());
      buffer = "";
    } else if (char === "}") {
      const selector = stack.pop() ?? "";
      if (!selector.startsWith("@"))
        found.push({
          selector,
          body: buffer.trim(),
          layered: stack.some((prelude) => prelude.startsWith("@layer")),
        });
      buffer = "";
    } else buffer += char;
  }
  return found;
}

describe("one colour scheme", () => {
  const wrapperRule = rules(shell).find((rule) =>
    /color-scheme:\s*inherit/.test(rule.body),
  );

  it("makes every Theme wrapper inherit the root's scheme, unlayered", () => {
    expect(wrapperRule).toBeDefined();
    expect(wrapperRule!.layered).toBe(false);
    for (const mode of ["light", "dark", "system"] as const) {
      document.body.innerHTML = renderToStaticMarkup(
        <Theme theme={editorialTheme} mode={mode}>
          <main />
        </Theme>,
      );
      const wrapper = document.body.querySelector("[data-astryx-theme]");
      expect(wrapper?.matches(wrapperRule!.selector)).toBe(true);
      // The root carries the theme attribute too; it keeps its own scheme.
      document.documentElement.setAttribute("data-astryx-theme", "editorial");
      expect(document.documentElement.matches(wrapperRule!.selector)).toBe(
        false,
      );
    }
  });

  it("leaves media overlays their own scheme", () => {
    document.body.innerHTML =
      '<div data-astryx-theme="editorial" data-astryx-media="dark"></div>';
    expect(
      document.body.firstElementChild?.matches(wrapperRule!.selector),
    ).toBe(false);
  });

  it("outranks Astryx's scheme classes because those are layered", () => {
    const schemes = rules(astryx).filter((rule) =>
      /color-scheme:\s*(light|dark)/.test(rule.body),
    );
    expect(schemes.length).toBeGreaterThan(0);
    for (const rule of schemes) expect(rule.layered).toBe(true);
  });
});
