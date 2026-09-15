import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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

// Divider covers the Astryx Divider and DropdownMenuDivider components, their
// imports, and hasDivider, hasDividers or defaultHasDividers props. A dividers
// prop or option passes only as the literal "none".
const markupDividers = [
  /Divider/,
  /<hr[\s/>]/i,
  /\brole=["']separator["']/,
  /\btype:\s*["']divider["']/,
  /\bdividers\s*[=:]\s*(?!\{?\s*["']none["']\s*\}?(?:[\s,;/>]|$))/,
];
const markupViolations = (text: string) =>
  markupDividers.filter((pattern) => pattern.test(text)).map(String);

// One-sided borders that frame or mark something rather than separate
// siblings. Rows, columns and sections separate with spacing tokens.
const structuralEdges = new Set([
  // pane and sheet edges
  ".admin-side-nav border-right", // navigation pane edge
  ".sidebar border-right", // navigation pane edge
  ".sidebar border-bottom", // stacked navigation pane edge
  ".operations-workspace .operations-service-detail border-inline-start", // master/detail pane edge
  ".semantic-inspector border-left", // side sheet edge
  ".semantic-inspector border-top", // bottom sheet edge
  ".operator-inspector-panel border-left", // side sheet edge
  ".operator-inspector-panel border-top", // bottom sheet edge
  // sticky or fixed bars over scrolling content
  ".admin-mobile-topbar border-bottom",
  ".admin-mobile-nav border-top",
  ".admin-mobile-strip border-bottom",
  ".astryx-editor-actions border-top",
  ".semantic-inspector-actions border-top",
  // markers on a single element
  ".publication-step border-block-end", // progress bar whose color is state
  ".activation-focus > a border-bottom", // text link underline
  ".activation-edge i::after border-top", // arrowhead on a graph edge
  ".activation-edge i::after border-right", // arrowhead on a graph edge
  ".article-composer .tiptap blockquote border-inline-start", // quote bar
  ".activation-node border-left", // 2px layer accent
  ".inbox-next-action border-left", // 2px callout accent
  ".knowledge-retrieval border-left", // 2px callout accent
  ".operator-candidate-status border-left", // 2px status accent
  ".operator-inspector-summary > div border-left", // 2px summary accent
]);

// Drawn one-sided borders by default, or the ones reset to 0 or none.
function sideBorders(css: string, drawn = true): string[] {
  const found = new Set<string>();
  const selectors: string[] = [];
  let buffer = "";
  const declaration = () => {
    const [property = "", ...value] = buffer.split(":");
    const name = property.trim();
    if (
      /^border-(?:top|bottom|left|right|(?:block|inline)(?:-start|-end)?)$/.test(
        name,
      ) &&
      /^(?:0|none)\b/.test(value.join(":").trim()) !== drawn
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

describe("divider guard fixtures", () => {
  it.each([
    'import { Divider } from "@astryxdesign/core/Divider";',
    '<Divider label="or" />',
    "<DropdownMenuDivider />",
    "<LayoutHeader hasDivider>Title</LayoutHeader>",
    "<List hasDividers>",
    "<Layout defaultHasDividers>",
    "<hr />",
    '<div role="separator" />',
    '{ type: "divider" }',
    '<Section dividers={["bottom"]}>',
    "<Toolbar dividers={['top', 'bottom']} />",
    '<Table dividers="columns" />',
    '<Table dividers={"rows"} />',
    '<Table dividers={dense ? "none" : "rows"} />',
    'const table = { dividers: "grid" };',
  ])("flags %s", (markup) => {
    expect(markupViolations(markup)).not.toEqual([]);
  });

  it.each([
    '<Table dividers="none" />',
    '<Table dividers={"none"} />',
    'const table = { dividers: "none" };',
    '{ type: "section", title: "Draft", items }',
  ])("allows %s", (markup) => {
    expect(markupViolations(markup)).toEqual([]);
  });

  it("flags every drawn side border and ignores resets and outlines", () => {
    const css = `
      .metrics div + div { border-left: 1px solid var(--border); }
      .states span { border-right: 1px solid var(--border); }
      .states span:last-child { border-right: 0; }
      .panes > section + section { border-inline-start: var(--border-width) solid; }
      .columns { border-inline: 1px solid; }
      .rows li { border-bottom: 1px solid; }
      .band { border-block: 1px solid; }
      .field { border: 1px solid; border-left-color: transparent; }
      @media (max-width: 860px) { .metrics div + div { border-left: none; } }
    `;
    expect(sideBorders(css)).toEqual([
      ".metrics div + div border-left",
      ".states span border-right",
      ".panes > section + section border-inline-start",
      ".columns border-inline",
      ".rows li border-bottom",
      ".band border-block",
    ]);
    expect(sideBorders(css, false)).toEqual([
      ".states span:last-child border-right",
      ".metrics div + div border-left",
    ]);
  });
});

it("keeps divider props, rules, and menu dividers out of admin markup", () => {
  const violations = sources([".ts", ".tsx", ".astro"]).flatMap(
    ({ path, text }) =>
      markupViolations(text).map((pattern) => `${path} ${pattern}`),
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

// Astryx draws a rule under every table header cell with no prop to turn it
// off. Its styles sit in a cascade layer, so one unlayered reset wins.
it("hides the rule Astryx draws under every table header", () => {
  const resets = sources([".css"]).filter(({ text }) =>
    sideBorders(text, false).includes(
      ".astryx-table-header-cell border-bottom",
    ),
  );
  expect(resets.map(({ path }) => path)).toEqual(["styles/editorial.css"]);
  for (const layout of ["AdminLayout", "EditorialLayout"])
    expect(
      readFileSync(join(root, `layouts/${layout}.astro`), "utf8"),
    ).toContain('import "../styles/editorial.css";');
});

it("separates admin rows, columns and sections without border rules", () => {
  const edges = sources([".css"]).flatMap(({ path, text }) =>
    sideBorders(text).map((edge) => ({ path, edge })),
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

it("keeps middots out of admin interface copy", () => {
  // House style: separate phrases with commas, periods or parentheses. The dev
  // review catalog's multilingual stress fixture is the one deliberate case.
  const root = new URL("..", import.meta.url).pathname;
  const offenders = readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) => /\.(astro|tsx?)$/.test(path))
    .filter((path) => !/\.test\.tsx?$/.test(path))
    .filter((path) => !path.endsWith("dev-review-catalog.tsx"))
    .filter((path) => readFileSync(`${root}${path}`, "utf8").includes("·"));
  expect(offenders).toEqual([]);
});
