import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8").replace(/\s+/g, " ");
const editorial = read("../../styles/editorial.css");
const operations = read("./operations-workspace.css");
const life = read("../life/life-workspace.css");
const canvas = read("../../styles/admin-canvas.css");
const block = (css: string, query: string) => {
  const start = css.indexOf(`@media ${query} {`);
  expect(start, query).toBeGreaterThan(-1);
  let depth = 0;
  for (let index = css.indexOf("{", start); index < css.length; index++) {
    if (css[index] === "{") depth++;
    if (css[index] === "}" && --depth === 0) return css.slice(start, index);
  }
  return css.slice(start);
};

describe("workspace page frames", () => {
  it("gives every workspace page the Content library's inline gutter", () => {
    expect(editorial).toContain(
      ".editorial-workspace-shell .admin-page-frame { padding-block: var(--spacing-6); padding-inline: clamp(var(--spacing-4), 3vw, var(--spacing-12));",
    );
    expect(life).toContain(
      ".editorial-workspace-shell .admin-page-frame:has(.life-workspace) { padding: 0; }",
    );
  });

  it("keeps the Content library's phone columns out of Operations", () => {
    const phone = block(editorial, "(max-width: 480px)");
    for (const rule of phone.matchAll(/([^{}]+)\{[^}]*display: none/g)) {
      const selectors = rule[1]!.split(",").map((part) => part.trim());
      for (const selector of selectors.filter((part) =>
        part.includes("editorial-record-table"),
      ))
        expect(selector).toMatch(/^\.editorial-library /);
    }
  });

  it("moves Operations state under the name on phones instead of hiding it", () => {
    expect(operations).toContain(
      ".operations-workspace .operations-mobile-status { display: none; }",
    );
    const phone = block(operations, "(max-width: 480px)");
    expect(phone).toContain(".operations-inventory-table td:nth-child(n + 2)");
    expect(phone).toContain(".operations-evidence-table td:nth-child(2)");
    expect(phone).toContain(
      ".operations-workspace .operations-mobile-status { display: flex; }",
    );
    expect(operations).toContain("word-break: normal;");
  });

  it("lets a canvas header move its summary below the title when tight", () => {
    const tablet = block(canvas, "(max-width: 1080px)");
    expect(tablet).toContain("flex-wrap: wrap;");
    expect(tablet).toContain(
      ".admin-canvas .operator-eyebrow { white-space: nowrap; }",
    );
  });
});
