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
  expect(css).toContain("--focus-outline-width: 0");
  expect(css).toContain("--focus-outline-style: none");
  expect(css).toContain(":focus-visible");
  expect(css).toContain("background-color: var(--color-accent-muted)");
  expect(css).toContain("background-color: Highlight");
});
it("preserves validation boundaries while removing ordinary focus halos", () => {
  expect(css).toContain(":not([data-status]):focus-within");
  expect(css).toContain("border-color: var(--color-border)");
  expect(css).toContain("box-shadow: none");
  expect(css).not.toContain("--color-accent:");
});
