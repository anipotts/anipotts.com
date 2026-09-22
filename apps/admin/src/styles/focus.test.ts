import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const css = readFileSync(new URL("./focus.css", import.meta.url), "utf8");
it("shares one neutral keyboard focus policy through the one document", () => {
  const document = readFileSync(
    new URL("../layouts/AdminDocument.astro", import.meta.url),
    "utf8",
  );
  expect(document).toContain('import "../styles/focus.css"');
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
