import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8").replace(/\s+/g, " ");
const shell = read("../../styles/shell.css");
const operations = read("./operations-workspace.css");
const kit = read("../workspace/workspace.css");
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
    expect(shell).toContain(
      ".editorial-workspace-shell .admin-page-frame { padding-block: var(--spacing-6); padding-inline: clamp(var(--spacing-4), 3vw, var(--spacing-12));",
    );
    // Data and Observability pages sit in that frame as they are; neither
    // resets it to set a gutter of its own.
    for (const css of [kit, operations])
      expect(css).not.toContain("admin-page-frame");
  });

  it("hides phone columns only through the shared table", () => {
    const phone = block(kit, "(max-width: 480px)");
    for (const rule of phone.matchAll(/([^{}]+)\{[^}]*display: none/g)) {
      const selectors = rule[1]!.split(",").map((part) => part.trim());
      for (const selector of selectors.filter((part) =>
        part.includes("editorial-record-table"),
      ))
        expect(selector).toMatch(/^\.workspace-table /);
    }
  });

  it("moves every table's middle columns under its title on phones", () => {
    expect(kit).toContain(
      ".workspace-table .editorial-record-table :is(th, td):nth-child(n + 2):nth-last-child(n + 2) { display: none; }",
    );
    expect(kit).toContain(
      ".workspace-table .editorial-mobile-status { display: flex; }",
    );
    // Observability keeps no column rules of its own.
    expect(operations).not.toMatch(
      /nth-child|ops-status-table|ops-mobile-status/,
    );
    // Workspace themes cannot tint a table apart from the others.
    expect(kit).toContain(
      ".workspace-table .astryx-base-table:not(#\\#):not(#\\#) { background: transparent; }",
    );
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
    const library = kit;
    // Cells carry their own inset; only the cell holding the tallest control
    // goes without, so rows stay one control tall.
    expect(library).toContain(
      ".workspace-table .editorial-record-table .astryx-table-cell { vertical-align: middle; padding-block: var(--spacing-1); }",
    );
    expect(library).toContain(
      ".workspace-table .editorial-record-table .astryx-table-cell:last-child { padding-block: 0; }",
    );
    // The whole row is the click target; the title link wraps only its text.
    expect(library).toContain(
      '.workspace-table .record-link::after { content: ""; position: absolute; inset: 0; }',
    );
    expect(library).toContain(
      ".workspace-table .editorial-record-table tr { position: relative; }",
    );
    for (const rule of [
      ".workspace-table .editorial-record-summary,",
      ".workspace-table .editorial-record-state > .astryx-token:not(#\\#):not(#\\#):not(#\\#) { flex: 0 0 auto; }",
    ])
      expect(library).toContain(rule);
    // The phone row keeps its state under the title and gets the room for it.
    expect(library).toContain(
      ".workspace-table .editorial-record-table .astryx-table-cell { padding-block: var(--spacing-2); }",
    );
    expect(library).toContain(
      ":is(th, td):nth-child(n + 2):nth-last-child(n + 2) { display: none; }",
    );
  });
});
