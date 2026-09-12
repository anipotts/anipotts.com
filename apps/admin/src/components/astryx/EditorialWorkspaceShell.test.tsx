import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditorialApp } from "./EditorialApp";
import {
  workspaceSelection,
  websiteNavigation,
} from "./EditorialWorkspaceShell";

describe("Website workspace navigation", () => {
  it("keeps record identity and newsletter selection independent of library filters", () => {
    expect(workspaceSelection("content", "pages", "writing")).toBe("writing");
    expect(workspaceSelection("content", "pages", "home")).toBe("website");
    expect(workspaceSelection("content", undefined, "work")).toBe("work");
    expect(workspaceSelection("newsletter", "writing")).toBe("newsletter");
    expect(workspaceSelection("content", "systems")).toBe("website");
    expect(workspaceSelection("content")).toBe("pages");
  });
  it("defines only supported Website destinations", () => {
    expect(websiteNavigation.map((item) => item.href)).toEqual([
      "/content",
      "/content?group=writing",
      "/content?group=website",
      "/content?group=work",
      "/newsletter",
    ]);
  });
  it("renders one workspace shell with navigation, preserves private logout boundary", () => {
    const render = (localPreview: boolean) =>
      renderToStaticMarkup(
        <EditorialApp
          title="Content"
          area="content"
          localPreview={localPreview}
          siteUrl="https://anipotts.com/"
        />,
      );
    const local = render(true);
    expect(local).toContain('aria-label="Content"');
    expect(local).toContain("Pages");
    expect(local).not.toContain("/cdn-cgi/access/logout");
    expect(render(false)).toContain("/cdn-cgi/access/logout");
    expect(local).not.toContain('class="editorial-nav-actions"');
  });
});

it("contains popup rows within the trigger width without cumulative padding", () => {
  const css = readFileSync(
    new URL("./WorkspaceHeader.css", import.meta.url),
    "utf8",
  ).replace(/\s+/g, " ");
  const declarations = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    expect(start).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf("}", start));
  };
  expect(declarations(".astryx-popover.editorial-workspace-popover")).toContain(
    "padding: 0;",
  );
  for (const selector of [
    ".editorial-workspace-popover .editorial-workspace-switcher",
    ".editorial-workspace-popover .editorial-workspace-switcher .astryx-side-nav-item",
  ]) {
    const rule = declarations(selector);
    expect(rule).toContain("box-sizing: border-box;");
    expect(rule).toContain("width: 100%;");
    expect(rule).toContain("min-width: 0;");
  }
});

it("uses 44px touch targets with 4px rail insets only on coarse tablets", () => {
  const css = readFileSync(
    new URL("./WorkspaceHeader.css", import.meta.url),
    "utf8",
  );
  const coarse = css.slice(
    css.indexOf("@media (min-width: 768px) and (pointer: coarse)"),
  );
  expect(coarse).toContain("padding-inline: var(--spacing-1)");
  expect(coarse).toContain("width: var(--spacing-11)");
  expect(coarse).toContain("height: var(--spacing-11)");
  expect(coarse).toContain(
    '.editorial-workspace-shell[data-sidebar-collapsed="true"]',
  );
  expect(coarse).not.toContain(".astryx-app-shell-sidenav");
});
