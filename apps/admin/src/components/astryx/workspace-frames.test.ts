import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8").replace(/\s+/g, " ");
const shell = read("../../styles/shell.css");
const observability = read("./observability-workspace.css");
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

// styles/theme-contract.test.ts holds the gutter, and lib/breakpoints.test.ts
// with Workspace.test.tsx the named column ranges.
describe("workspace page frames", () => {
  it("turns every table into a full-bleed list of lead cells at compact", () => {
    const compact = block(kit, "(max-width: 640px)");
    expect(compact).toContain(
      ".workspace-table :is(th, td):not(:first-child) { display: none; }",
    );
    expect(compact).toContain(
      "margin-inline: calc(-1 * var(--admin-gutter, 0px));",
    );
    expect(compact).toContain(".workspace-table-footer { display: none; }");
    expect(compact).toContain(".workspace-row-end { display: inline-flex; }");
    // Observability keeps no column rules of its own.
    expect(observability).not.toMatch(/ops-status-table|ops-mobile-status/);
    // Workspace themes cannot tint a table apart from the others.
    expect(kit).toContain(
      ".workspace-table .astryx-base-table:not(#\\#):not(#\\#) { background: transparent; }",
    );
  });

  it("keeps every sidebar icon on one centerline", () => {
    // Astryx centres an 18px icon in a 16px slot, so the glyph starts a pixel
    // outside it; the search button holds the icon's own width instead.
    expect(header).toContain(
      ".approved-workspace-header .editorial-header-search { padding-inline-start: calc(var(--spacing-9) / 4); }",
    );
    expect(header).toContain(
      ".editorial-workspace-nav .editorial-header-search > span:first-child > span:first-child:not(#\\#):not(#\\#) { width: calc(var(--spacing-9) / 2); flex: none; }",
    );
    // In the rail there is no label to align to, so the icon takes the middle.
    expect(header).toContain(
      ".editorial-header-search { padding-inline: 0; justify-content: center; }",
    );
  });

  it("draws the group headings and the current page's icon in the workspace accent", () => {
    expect(header).toContain(
      '.admin-unified-nav [aria-current="page"] svg { color: var(--color-icon-accent); }',
    );
    // Headings and chevrons take the accent, as the approved sidebar did.
    expect(header).toContain(
      ".admin-unified-nav [data-sidebar-group], .admin-unified-nav [data-sidebar-group] svg { color: var(--color-text-accent); }",
    );
    expect(header).not.toMatch(
      /\[data-sidebar-group\][^{]*\{[^}]*color: var\(--color-text-secondary\)/,
    );
    // Workspace accents are the theme's own tokens, declared once in
    // themes/workspace-accents.css; the shell keeps no copies.
    for (const css of [header, shell]) expect(css).not.toMatch(/--ws-/);
  });

  it("separates the sidebar groups with space and pins pages to one inset", () => {
    expect(header).toContain(
      ".admin-unified-nav { display: flex; flex-direction: column; gap: var(--spacing-2);",
    );
    expect(header).toContain(
      '.admin-unified-nav [data-sidebar-group] + [role="group"] > div { display: flex; flex-direction: column; gap: var(--spacing-0-5); padding-inline-start: 0; }',
    );
  });

  it("keeps each table row one control tall, the whole row the target", () => {
    // Cells carry their own inset; only the cell holding the tallest control
    // goes without, so rows stay one control tall.
    expect(kit).toContain(
      ".workspace-table .astryx-table-cell { vertical-align: middle; padding-block: var(--spacing-1); }",
    );
    expect(kit).toContain(
      ".workspace-table .astryx-table-cell:last-child { padding-block: 0; }",
    );
    // The whole row is the click target; the title link wraps only its text.
    expect(kit).toContain(
      '.workspace-row-link::after { content: ""; position: absolute; inset: 0; }',
    );
    expect(kit).toContain(".workspace-table tbody tr { position: relative; }");
    // Hover tints only where hover exists, and focus tints instead of rings.
    expect(block(kit, "(hover: hover)")).toContain(
      '.workspace-table[data-interactive="true"] tbody tr:hover',
    );
    expect(kit).not.toMatch(/outline:\s*(?!none)[^;]*solid/);
  });
});
