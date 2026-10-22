import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { editorialTheme } from "../themes/editorial.js";

const css = readFileSync(
  new URL("../themes/editorial.generated.css", import.meta.url),
  "utf8",
);
const parsed = postcss.parse(css);
describe("aligned Astryx editorial theme", () => {
  it("ships a compiled theme for Core and CLI 0.7.1", () => {
    expect(editorialTheme.__built).toBe(true);
    expect(css).toContain("Core: @astryxdesign/core@0.7.1");
    expect(css).toContain("CLI: @astryxdesign/cli@0.7.1");
    expect(css).toContain("@layer reset, astryx-base, astryx-theme;");
    expect(editorialTheme.components).toHaveProperty("text-area");
    expect(editorialTheme.components).not.toHaveProperty("textarea");
  });
  it("keeps the touch type adaptation and the house font in its compiled output", () => {
    const adaptive: Record<string, string> = {};
    parsed.walkAtRules("media", (rule) => {
      if (rule.params !== "(width < 1024px) and (pointer: coarse)") return;
      rule.walkDecls((declaration) => {
        adaptive[declaration.prop] = declaration.value;
      });
    });
    expect(adaptive["--font-size-base"]).toBe("1rem");
    expect(adaptive["--text-body-size"]).toBe("var(--font-size-base)");
    for (const name of [
      "--font-family-body",
      "--font-family-heading",
    ] as const) {
      expect(editorialTheme.tokens[name]).toBe(
        '"Instrument Sans Variable", sans-serif',
      );
      expect(adaptive[name]).toBe(editorialTheme.tokens[name]);
    }
    expect(css).not.toContain("Figtree");
  });
  it("uses canonical field and table targets in handwritten styling", () => {
    for (const relative of [
      "./focus.css",
      "./editor.css",
      "../components/workspace/workspace.css",
    ]) {
      const file = new URL(relative, import.meta.url);
      expect(readFileSync(file, "utf8"), fileURLToPath(file)).not.toMatch(
        /\.astryx-(?:textarea|base-table)\b/,
      );
    }
  });
});
