import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    expect(local).not.toContain("/auth/logout");
    expect(render(false)).toContain("/auth/logout");
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
    css.indexOf("@media (width > 768px) and (pointer: coarse)"),
  );
  expect(coarse).toContain("padding-inline: var(--spacing-1)");
  expect(coarse).toContain("width: var(--spacing-11)");
  expect(coarse).toContain("height: var(--spacing-11)");
  expect(coarse).toContain(
    '.editorial-workspace-shell[data-sidebar-collapsed="true"]',
  );
  expect(coarse).not.toContain(".astryx-app-shell-sidenav");
});

describe("local owner indicator", () => {
  afterEach(() => vi.unstubAllGlobals());
  const render = (localOwner?: boolean) =>
    renderToStaticMarkup(
      <EditorialApp
        title="Content"
        area="content"
        localPreview
        localOwner={localOwner}
        siteUrl="https://anipotts.com/"
      />,
    );

  it("marks a local owner screen only in a build compiled with the flag", () => {
    expect(render(true)).not.toContain("Local owner");
    vi.stubGlobal("__LOCAL_OWNER_BUILD__", true);
    const html = render(true);
    expect(html).toContain(">Local owner<");
    expect(html).toContain('data-admin-local-owner="true"');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('aria-label="Remove');
    expect(render(false)).not.toContain("Local owner");
    expect(render()).not.toContain("data-admin-local-owner");
  });

  it("keeps the indicator fixed over every layout without a rule", () => {
    const css = readFileSync(
      new URL("./WorkspaceHeader.css", import.meta.url),
      "utf8",
    ).replace(/\s+/g, " ");
    const start = css.indexOf(".admin-local-owner-indicator {");
    expect(start).toBeGreaterThan(-1);
    const rule = css.slice(start, css.indexOf("}", start));
    expect(rule).toContain("position: fixed;");
    expect(rule).toContain("pointer-events: none;");
    // Rounded corners only: no rule lines, no raw colours.
    expect(rule).not.toMatch(/border(?!-radius)|#[0-9a-f]{3,6}\b/i);
  });
});
