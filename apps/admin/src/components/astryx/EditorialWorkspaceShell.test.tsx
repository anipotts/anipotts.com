import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorialApp } from "./EditorialApp";
import {
  EditorialWorkspaceShell,
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
      "/content?group=website",
      "/content?group=writing",
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

it("writes the phone and tablet header into server HTML and lets CSS show it", () => {
  // The server has no viewport, so AppShell renders its desktop layout. The
  // header must still be in that markup: hydration cannot be what shows it.
  const html = renderToStaticMarkup(
    <EditorialWorkspaceShell
      area="content"
      mode="light"
      changeTheme={() => {}}
      siteHref="https://anipotts.com"
      localPreview
    >
      <p>Record</p>
    </EditorialWorkspaceShell>,
  );
  const header = html.slice(html.indexOf('role="banner"'));
  expect(html).toContain('role="banner"');
  expect(header).toContain("admin-mobile-header");
  expect(header).toContain("[</span>admin");
  expect(header).toContain('aria-label="Switch workspace: Content"');
  expect(header).toContain('aria-label="Open navigation"');
  // No drawer exists on the server, so the button references none.
  const menuButton = /<button[^>]*aria-label="Open navigation"[^>]*>/.exec(
    html,
  )?.[0];
  expect(menuButton).toBeDefined();
  expect(menuButton).not.toContain("aria-controls");
  // AppShell's own top bar, which only mounts after hydration, is off.
  expect(html).not.toContain('data-mode="topbar"');

  const css = readFileSync(
    new URL("./WorkspaceHeader.css", import.meta.url),
    "utf8",
  ).replace(/\s+/g, " ");
  expect(css).toContain(
    "@media (width > 768px) { .editorial-workspace-shell .astryx-app-shell-header:has(.admin-mobile-header) { display: none; } }",
  );
  const shell = readFileSync(
    new URL("./EditorialWorkspaceShell.tsx", import.meta.url),
    "utf8",
  );
  expect(shell).toContain('mobileNav={{ breakpoint: "md", hasToggle: false }}');
  expect(shell).toContain("banner={<WorkspaceTopBar workspace={workspace} />}");
});

it("sizes sidebar menus to the sidebar and keeps tooltips whole", () => {
  const css = readFileSync(
    new URL("./WorkspaceHeader.css", import.meta.url),
    "utf8",
  ).replace(/\s+/g, " ");
  const rule = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    expect(start, selector).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf("}", start));
  };
  // The identity column spans the sidebar or drawer, so the workspace menu can.
  expect(
    rule(".editorial-workspace-nav .editorial-workspace-identity"),
  ).toContain("align-self: stretch;");
  // The phone and tablet header keeps a compact menu beside the wordmark.
  expect(rule(".admin-mobile-header .admin-sidebar-menu")).toContain(
    "width: auto;",
  );
  // The drawer's close button leaves the header row instead of narrowing it.
  expect(
    rule(
      ".astryx-mobile-nav.editorial-workspace-nav div:has(> .editorial-workspace-identity) > .astryx-button:last-child",
    ),
  ).toContain("position: absolute;");
  // Tooltips never break inside a word, and the rail's side placement has
  // somewhere to go when the side has no room.
  const tooltip = rule(".astryx-tooltip");
  expect(tooltip).toContain("width: max-content;");
  expect(tooltip).toContain("word-break: normal;");
  expect(tooltip).toContain("overflow-wrap: normal;");
  expect(css).toContain(
    "position-try-fallbacks: --admin-tooltip-below, --admin-tooltip-above !important;",
  );
  expect(css).not.toContain("toggle-button-group");
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
