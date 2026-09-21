import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8").replace(/\s+/g, " ");
const editorial = read("../../styles/editorial.css");
const operations = read("./operations-workspace.css");
const life = read("../life/life-workspace.css");
const header = read("./WorkspaceHeader.css");
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

  it("keeps every sidebar icon on one centerline", () => {
    // Astryx centres an 18px icon in a 16px slot, so the glyph starts a pixel
    // outside it. The bordered menus absorb that with their border; the
    // borderless search button adds the same width.
    expect(header).toContain(
      ".approved-workspace-header .editorial-header-search { padding-inline-start: calc(var(--spacing-9) / 4); }",
    );
    expect(header).toContain(
      ".approved-workspace-header .admin-workspace-selector, .editorial-workspace-utilities .admin-sidebar-menu { padding-inline-start: calc(var(--spacing-9) / 4 - var(--border-width)); }",
    );
    // The drawer uses the same inset, so the bordered menus ask for a pixel
    // less there too.
    expect(header).toContain(
      ".editorial-workspace-nav :is(.admin-workspace-selector, .admin-sidebar-menu) { padding-inline-start: calc(var(--spacing-2) - var(--border-width)); }",
    );
    // In the rail there is no label to align to, so the icon takes the middle.
    expect(header).toContain(
      ":is(.admin-sidebar-menu, .editorial-header-search) { padding-inline: 0; justify-content: center; }",
    );
    expect(header).toContain(
      ":is(.admin-sidebar-menu, .editorial-header-search) > span:first-child { justify-content: center; }",
    );
    expect(header).toContain(
      ".admin-sidebar-menu > span:first-child > span:first-child > svg:not(#\\#):not(#\\#) { width: calc(var(--spacing-9) / 2); height: calc(var(--spacing-9) / 2); flex: none; }",
    );
  });

  it("keeps one tint and one accent token per workspace", () => {
    for (const workspace of ["content", "data", "observability"])
      for (const role of ["tint", "accent"])
        expect(header).toMatch(
          new RegExp(`--ws-${workspace}-${role}: light-dark\\(`),
        );
  });

  it("separates the sidebar groups with space and pins pages to one inset", () => {
    expect(header).toContain(
      ".admin-unified-nav { display: flex; flex-direction: column; gap: var(--spacing-2);",
    );
    expect(header).toContain(
      '.admin-unified-nav [data-sidebar-group] + [role="group"] > div { display: flex; flex-direction: column; gap: var(--spacing-0-5); padding-inline-start: 0; }',
    );
  });

  it("keeps the library table one line per record", () => {
    const library = read("../../styles/editorial.css");
    // Cells carry their own inset; only the cell holding the tallest control
    // goes without, so rows stay one control tall.
    expect(library).toContain(
      ".editorial-library .editorial-record-table .astryx-table-cell { vertical-align: middle; padding-block: var(--spacing-1); }",
    );
    expect(library).toContain(
      ".editorial-library .editorial-record-table .astryx-table-cell:last-child { padding-block: 0; }",
    );
    expect(library).toContain(
      "min-height: var(--spacing-7); justify-content: flex-start; padding-block: var(--spacing-1); padding-inline: var(--spacing-2);",
    );
    for (const rule of [
      ".editorial-library .editorial-record-summary,",
      ".editorial-library .editorial-record-state > .astryx-token:not(#\\#):not(#\\#):not(#\\#) { flex: 0 0 auto; }",
    ])
      expect(library).toContain(rule);
    // The phone row keeps its state under the title and gets the room for it.
    expect(library).toContain(
      ".editorial-library .editorial-record-table .astryx-table-cell { padding-block: var(--spacing-2); }",
    );
    expect(library).toContain(
      ":is(th, td):nth-child(n + 2):nth-last-child(n + 2) { display: none; }",
    );
  });
});
