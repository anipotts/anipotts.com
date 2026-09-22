// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorialApp } from "./EditorialApp";
import {
  EditorialWorkspaceShell,
  workspaceSelection,
} from "./EditorialWorkspaceShell";
import { sidebarGroups } from "./UnifiedSidebar";

const websiteNavigation = sidebarGroups[0]!.items;
// jsdom serves modules over http, so the stylesheet is read from the package.
const HEADER_CSS = join(
  process.cwd(),
  "src/components/astryx/WorkspaceHeader.css",
);

describe("Website workspace navigation", () => {
  it("keeps record identity and newsletter selection independent of library filters", () => {
    expect(workspaceSelection("content", "pages", "writing")).toBe("writing");
    expect(workspaceSelection("content", "pages", "home")).toBe("website");
    expect(workspaceSelection("content", undefined, "work")).toBe("work");
    expect(workspaceSelection("newsletter", "writing")).toBe("newsletter");
    expect(workspaceSelection("content", "systems")).toBe("website");
    // The retired mixed overview has no route; it selects Pages.
    expect(workspaceSelection("content")).toBe("website");
    expect(workspaceSelection("content", "pages")).toBe("website");
  });
  it("defines only supported Website destinations", () => {
    expect(websiteNavigation.map((item) => item.href)).toEqual([
      "/content/pages",
      "/content/writing",
      "/content/projects",
      "/content/newsletter",
    ]);
    expect(websiteNavigation.map((item) => item.label)).toEqual([
      "Pages",
      "Writing",
      "Projects",
      "Newsletter",
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
    expect(local).toContain('aria-label="Admin"');
    expect(local).toContain('data-sidebar-group="content"');
    expect(local).toContain("Pages");
    expect(local).not.toContain("/auth/logout");
    expect(render(false)).toContain("/auth/logout");
    expect(local).not.toContain('class="editorial-nav-actions"');
  });
});

it("writes the one-row phone top bar and the page chips into server HTML, with no drawer", () => {
  // The server has no viewport, so AppShell renders its desktop layout. The
  // phone bar must still be in that markup: hydration cannot be what shows it.
  const html = renderToStaticMarkup(
    <EditorialWorkspaceShell
      area="content"
      selectedGroup="writing"
      mode="light"
      changeTheme={() => {}}
      localPreview
    >
      <p>Record</p>
    </EditorialWorkspaceShell>,
  );
  const host = document.createElement("div");
  host.innerHTML = html;
  const bar = host.querySelector('[role="banner"] .admin-phone-bar')!;
  expect(bar).not.toBeNull();
  // One row: the [A] monogram, the three workspaces, then search.
  expect([...bar.children].map((child) => child.tagName)).toEqual([
    "A",
    "NAV",
    "BUTTON",
  ]);
  const home = bar.firstElementChild as HTMLAnchorElement;
  expect(home.matches("a.admin-bracket-wordmark")).toBe(true);
  expect(home.getAttribute("href")).toBe("/");
  expect(home.getAttribute("aria-label")).toBe("Overview");
  expect(home.textContent).toBe("[A]");
  expect(bar.lastElementChild?.getAttribute("aria-label")).toBe("Search");
  const tabs = bar.querySelector('nav[aria-label="Workspaces"]')!;
  expect(
    [...tabs.querySelectorAll(".admin-phone-workspace")].map((tab) => [
      tab.textContent,
      tab.getAttribute("aria-current"),
    ]),
  ).toEqual([
    ["Content", "true"],
    ["Data", null],
    ["Observability", null],
  ]);
  // No device tile, page title, menu button or drawer in the bar.
  expect(bar.querySelector(".brand-tile")).toBeNull();
  expect(bar.textContent).toBe("[A]ContentDataObservability");
  expect(html).not.toContain("Open navigation");
  expect(host.querySelector(".astryx-mobile-nav")).toBeNull();
  expect(html).not.toContain('data-mode="topbar"');
  // Under it, in the page, the current workspace's pages.
  const pages = host.querySelector(
    '#astryx-app-shell-main nav.admin-phone-pages[aria-label="Content"]',
  )!;
  expect(
    [...pages.querySelectorAll(".admin-phone-page")].map((chip) => [
      chip.textContent,
      chip.getAttribute("aria-current"),
    ]),
  ).toEqual([
    ["Pages", null],
    ["Writing", "page"],
    ["Projects", null],
    ["Newsletter", null],
  ]);
});

it("lets a record page draw its own phone bar", () => {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    <EditorialWorkspaceShell
      area="content"
      recordKind="writing"
      mode="light"
      changeTheme={() => {}}
      localPreview
      recordPage
    >
      <p>Record</p>
    </EditorialWorkspaceShell>,
  );
  expect(host.querySelector(".admin-phone-bar")).toBeNull();
  expect(host.querySelector(".admin-phone-pages")).toBeNull();
  expect(
    host
      .querySelector(".editorial-workspace-shell")
      ?.getAttribute("data-record-page"),
  ).toBe("true");
  // The desktop sidebar stays.
  expect(host.querySelector(".admin-unified-nav")).not.toBeNull();
});

it("keeps tooltips whole and beside the rail", () => {
  const css = readFileSync(HEADER_CSS, "utf8").replace(/\s+/g, " ");
  const rule = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    expect(start, selector).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf("}", start));
  };
  // Tooltips never break inside a word, and the rail's side placement has
  // somewhere to go when the side has no room.
  const tooltip = rule(".astryx-tooltip");
  expect(tooltip).toContain("width: max-content;");
  expect(tooltip).toContain("word-break: normal;");
  expect(tooltip).toContain("overflow-wrap: normal;");
  expect(css).toContain(
    "position-try-fallbacks: --admin-tooltip-below, --admin-tooltip-above !important;",
  );
});

it("uses 44px touch targets with 4px rail insets only on coarse tablets", () => {
  const css = readFileSync(HEADER_CSS, "utf8");
  const start = css.lastIndexOf(
    "@media (min-width: 641px) and (pointer: coarse)",
  );
  expect(start).toBeGreaterThanOrEqual(0);
  // Inspect this complete media block, not unrelated rules later in the file.
  const end = css.indexOf("\n}", start);
  expect(end).toBeGreaterThan(start);
  const coarse = css.slice(start, end + 2);
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
    const host = document.createElement("div");
    host.innerHTML = render(true);
    const tiles = host.querySelectorAll('[data-admin-local-owner="true"]');
    // Beside the sidebar wordmark; the phone top bar holds no device tile.
    expect(tiles).toHaveLength(1);
    for (const tile of tiles) {
      // A laptop tile beside the wordmark, never a floating pill.
      expect(tile.parentElement?.matches(".editorial-identity-end")).toBe(true);
      expect(
        tile.querySelector('.brand-tile[data-mark="ap-pro"]'),
      ).not.toBeNull();
      expect(tile.querySelector('[aria-label="Remove"]')).toBeNull();
    }
    expect(render(false)).not.toContain("Local owner");
    expect(render()).not.toContain("data-admin-local-owner");
  });

  it("keeps the tile in the flow, with no fixed position or rule", () => {
    const css = readFileSync(HEADER_CSS, "utf8").replace(/\s+/g, " ");
    const start = css.indexOf(".admin-local-owner {");
    expect(start).toBeGreaterThan(-1);
    const rule = css.slice(start, css.indexOf("}", start));
    expect(rule).not.toMatch(/position|border(?!-radius)|#[0-9a-f]{3,6}\b/i);
  });
});
