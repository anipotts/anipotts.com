import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const css = readFileSync(new URL("./focus.css", import.meta.url), "utf8");
it("shares a neutral keyboard focus policy across both admin layouts", () => {
  for (const name of ["AdminLayout", "EditorialLayout"]) {
    const layout = readFileSync(
      new URL(`../layouts/${name}.astro`, import.meta.url),
      "utf8",
    );
    expect(layout).toContain('import "../styles/focus.css"');
  }
  expect(css).toContain("--focus-outline-color: var(--color-text-secondary)");
  expect(css).toContain(":focus-visible");
  expect(css).toContain(
    "var(--focus-outline-width) var(--focus-outline-style)",
  );
  expect(css).toContain("--focus-outline-color: CanvasText");
});
it("preserves validation borders and gives wrapped fields a replacement ring", () => {
  expect(css).toContain(":not([data-status]):focus-within");
  expect(css).toContain(".astryx-textarea):has(:focus-visible)");
  expect(css).not.toContain("outline: none !important");
  expect(css).not.toContain("--color-accent:");
});
