import { describe, expect, it } from "vitest";
import postcss from "postcss";
import { readFileSync } from "node:fs";
import {
  openaiScope,
  scopeOpenAISelector,
  OPENAI_SCOPE,
} from "../../styles/openai-scope.mjs";

describe("SDK stylesheet isolation", () => {
  it("scopes resets, root tokens, nested theme rules and utilities without touching keyframes", async () => {
    const css =
      '@layer theme {:root,:host {--color-text: black} :where([data-theme="dark"]) {--color-text: white}} @layer base {button,input {color: inherit} * {box-sizing:border-box}} .flex {display:flex} @keyframes spin {from {opacity:0} to {opacity:1}} @property --color {syntax:"<color>";initial-value:red;inherits:false}';
    const result = await postcss([openaiScope()]).process(css, {
      from: "/app/styles/openai.css",
    });
    expect(result.css).toContain(':where([data-admin-ui="openai"]) button');
    expect(result.css).toContain(
      ':where([data-admin-ui="openai"]):where([data-theme="dark"])',
    );
    expect(result.css).toContain(':where([data-admin-ui="openai"]) .flex');
    expect(result.css).toContain("from {opacity:0}");
    expect(result.css).not.toContain("@property");
    expect(result.css).not.toContain(":root");
    expect(result.css).not.toContain(":host");
  });
  it("lets existing component geometry override SDK resets", () => {
    const css = readFileSync(
      new URL("../../styles/layers.css", import.meta.url),
      "utf8",
    );
    const order = css
      .match(/@layer ([^;]+);/)![1]
      .split(",")
      .map((name) => name.trim());
    expect(order.indexOf("base")).toBeLessThan(order.indexOf("astryx-base"));
    expect(order.indexOf("astryx-base")).toBeLessThan(
      order.indexOf("astryx-theme"),
    );
  });
  it("does not rewrite the legacy entry", async () => {
    const css = ":root {--color:red} button {color:red}";
    const result = await postcss([openaiScope()]).process(css, {
      from: "/app/styles/admin.css",
    });
    expect(result.css).toBe(css);
  });
  it("preserves real KaTeX class names, identifiers and quoted attributes", () => {
    for (const selector of [
      ".katex .katex-html > .newline",
      ".katex .accent .accent-body",
      ".body-copy #html-preview",
      '[data-label="html body :root :host"]',
      ".\\:root .html-body",
    ])
      expect(scopeOpenAISelector(selector)).toBe(`${OPENAI_SCOPE} ${selector}`);
  });
  it("replaces only document tag and pseudo selector nodes", () => {
    expect(scopeOpenAISelector("html")).toBe(OPENAI_SCOPE);
    expect(scopeOpenAISelector("body > main")).toBe(`${OPENAI_SCOPE} > main`);
    expect(scopeOpenAISelector(":root")).toBe(OPENAI_SCOPE);
    expect(scopeOpenAISelector(":host(.active)")).toBe(
      `${OPENAI_SCOPE}:is(.active)`,
    );
    expect(scopeOpenAISelector(":where(:root)")).toBe(
      `${OPENAI_SCOPE}:where(${OPENAI_SCOPE})`,
    );
    expect(scopeOpenAISelector(":is(:root, .outside)")).toBe(
      `${OPENAI_SCOPE}:is(${OPENAI_SCOPE}, .outside)`,
    );
    expect(scopeOpenAISelector("& > .katex-html")).toBe("& > .katex-html");
  });
});
