import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

// Admin separates items and sections with spacing, never with rule lines.
const root = fileURLToPath(new URL("..", import.meta.url));
const sources = (extensions: string[]) =>
  readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter(
      (path) =>
        extensions.includes(extname(path)) &&
        !path.includes(".test.") &&
        !path.endsWith(".generated.css"),
    )
    .sort()
    .map((path) => ({ path, text: readFileSync(join(root, path), "utf8") }));

// Block borders that frame or mark something rather than separate siblings.
const structuralEdges = new Set([
  ".activation-focus > a border-bottom", // text link underline
  ".activation-edge i::after border-top", // arrowhead on a graph edge
  ".sidebar border-bottom", // stacked navigation pane edge
  ".admin-mobile-topbar border-bottom", // sticky bar over scrolling content
  ".admin-mobile-nav border-top", // fixed bar over scrolling content
  ".admin-mobile-strip border-bottom", // sticky bar over scrolling content
  ".astryx-editor-actions border-top", // sticky bar over scrolling content
  ".semantic-inspector-actions border-top", // sticky bar over scrolling content
  ".semantic-inspector border-top", // bottom sheet edge
  ".operator-inspector-panel border-top", // bottom sheet edge
  ".publication-step border-block-end", // progress bar whose color is state
]);

function blockBorders(css: string): string[] {
  const found = new Set<string>();
  const selectors: string[] = [];
  let buffer = "";
  const declaration = () => {
    const [property = "", ...value] = buffer.split(":");
    const name = property.trim();
    if (
      /^border-(?:top|bottom|block(?:-start|-end)?)$/.test(name) &&
      !/^(?:0|none)\b/.test(value.join(":").trim())
    )
      found.add(`${selectors.at(-1)} ${name}`);
    buffer = "";
  };
  for (const char of css.replace(/\/\*[\s\S]*?\*\//g, "")) {
    if (char === "{") {
      selectors.push(buffer.trim().replace(/\s+/g, " "));
      buffer = "";
    } else if (char === "}") {
      declaration();
      selectors.pop();
    } else if (char === ";") declaration();
    else buffer += char;
  }
  return [...found];
}

it("keeps divider props, rules, and menu dividers out of admin markup", () => {
  const violations = sources([".ts", ".tsx", ".astro"]).flatMap(
    ({ path, text }) =>
      [
        /\bhasDividers?\b/,
        /<hr[\s/>]/,
        /type:\s*"divider"/,
        /\bdividers="(?:rows|columns|grid)"/,
      ]
        .filter((pattern) => pattern.test(text))
        .map((pattern) => `${path} ${pattern}`),
  );
  expect(violations).toEqual([]);
});

it("turns off the row dividers Astryx tables draw by default", () => {
  const violations = sources([".tsx", ".astro"]).flatMap(({ path, text }) => {
    const tables = [...text.matchAll(/^([ \t]*)<Table\b[\s\S]*?^\1\/>/gm)];
    expect(tables).toHaveLength(text.match(/<Table\b/g)?.length ?? 0);
    return tables
      .filter(([table]) => !table.includes('dividers="none"'))
      .map(() => path);
  });
  expect(violations).toEqual([]);
});

it("separates admin rows and sections without block border rules", () => {
  const edges = sources([".css"]).flatMap(({ path, text }) =>
    blockBorders(text).map((edge) => ({ path, edge })),
  );
  expect(
    edges
      .filter(({ edge }) => !structuralEdges.has(edge))
      .map(({ path, edge }) => `${path} ${edge}`),
  ).toEqual([]);
  expect(
    [...structuralEdges].filter(
      (edge) => !edges.some((found) => found.edge === edge),
    ),
  ).toEqual([]);
});
