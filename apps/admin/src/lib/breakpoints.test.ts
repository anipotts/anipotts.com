import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BREAKPOINTS,
  BREAKPOINT_MIN,
  atLeast,
  below,
  isBelow,
} from "./breakpoints";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );

/** Every width a media condition may name: each range's edges. */
const EDGES = new Set(
  BREAKPOINTS.filter((range) => range !== "compact").flatMap((range) => [
    below(range),
    atLeast(range),
  ]),
);

describe("layout ranges", () => {
  it("are the four documented ranges", () => {
    expect(BREAKPOINT_MIN).toEqual({
      compact: 0,
      medium: 641,
      large: 1024,
      wide: 1440,
    });
    expect([...EDGES].sort()).toEqual([
      "(max-width: 1023px)",
      "(max-width: 1439px)",
      "(max-width: 640px)",
      "(min-width: 1024px)",
      "(min-width: 1440px)",
      "(min-width: 641px)",
    ]);
    expect(isBelow("medium", "large")).toBe(true);
    expect(isBelow("wide", "large")).toBe(false);
  });

  it("are the only widths the workspace kit's media queries use", () => {
    const css = read("../components/workspace/workspace.css");
    const widths = [...css.matchAll(/\((?:min|max)-width:\s*\d+px\)/g)].map(
      ([condition]) => condition,
    );
    expect(widths.length).toBeGreaterThan(0);
    expect(widths.filter((condition) => !EDGES.has(condition))).toEqual([]);
  });

  it("use the same names as a column's hideBelow", () => {
    const css = read("../components/workspace/workspace.css");
    for (const range of ["large", "wide"] as const)
      expect(css).toMatch(
        new RegExp(
          `@media \\${below(range).replace(")", "\\)")} \\{[^@]*\\[data-hide-below="${range}"\\]`,
        ),
      );
  });
});
