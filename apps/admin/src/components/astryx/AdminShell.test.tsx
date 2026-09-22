// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminShell } from "./AdminShell";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const shell = (route: string) => (
  <AdminShell currentRoute={route} title="Record" localPreview>
    <div>Content</div>
  </AdminShell>
);

describe("shared Data and Observability shell", () => {
  it("renders the shared identity and one sidebar with Content, Data and Observability", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(shell("/observability/status"));
    expect(
      host.querySelector('[data-workspace="observability"]'),
    ).not.toBeNull();
    // The wordmark is the home link, in the sidebar and the phone top bar.
    const wordmarks = host.querySelectorAll<HTMLAnchorElement>(
      "a.admin-bracket-wordmark",
    );
    expect(wordmarks).toHaveLength(2);
    for (const wordmark of wordmarks) {
      expect(wordmark.textContent).toBe("[admin]");
      expect(wordmark.getAttribute("href")).toBe("/");
      expect(wordmark.getAttribute("aria-label")).toBe("Overview");
    }
    const navigation = host.querySelector(".admin-unified-nav")!;
    expect(
      [...navigation.querySelectorAll("[data-sidebar-group]")].map(
        (heading) => heading.textContent,
      ),
    ).toEqual(["Content", "Data", "Observability"]);
    expect(
      navigation
        .querySelector('a[data-sidebar-id="overview"]')
        ?.getAttribute("href"),
    ).toBe("/");
    const links = [
      ...navigation.querySelectorAll<HTMLAnchorElement>(
        'a[data-sidebar-member="observability"]',
      ),
    ];
    expect(links.map((link) => link.textContent)).toEqual([
      "Status",
      "Activity",
      "Alerts",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/observability/status",
      "/observability/activity",
      "/observability/alerts",
    ]);
    expect(navigation.querySelector("details")).toBeNull();
  });
  it.each([
    ["/observability/status", "Status"],
    ["/observability/activity", "Activity"],
    ["/observability/alerts", "Alerts"],
    ["/", "Overview"],
  ])("selects only its own destination: %s", (route, label) => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(shell(route));
    const selected = host.querySelectorAll(
      '.admin-unified-nav a[aria-current="page"]',
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]?.textContent).toBe(label);
  });
  it.each(["/work?view=machines", "/observability/status-old", "/proof"])(
    "does not select a destination from a partial route match: %s",
    (route) => {
      const host = document.createElement("div");
      host.innerHTML = renderToStaticMarkup(shell(route));
      expect(
        host.querySelectorAll('.admin-unified-nav a[aria-current="page"]'),
      ).toHaveLength(0);
    },
  );
  it("renders Data navigation with the one palette", () => {
    const markup = renderToStaticMarkup(shell("/data/sources"));
    expect(markup).toContain('data-workspace="data"');
    expect(markup).toMatch(/href="\/data\/sources"[^>]*aria-current="page"/);
    expect(markup).toContain('href="/data/records"');
    expect(markup).not.toContain('href="/life');
    expect(markup).not.toContain('href="/inbox"');
    expect(markup.match(/admin-command-palette-centered/g)).toHaveLength(1);
  });
  it("keeps the overview workspace-neutral", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(shell("/"));
    expect(host.querySelector("[data-workspace]")).toBeNull();
    // No group is forced open and no workspace tab is current.
    expect(
      host.querySelector('.admin-phone-workspace[aria-current="true"]'),
    ).toBeNull();
    expect(host.querySelector(".admin-phone-page")).toBeNull();
    expect(host.querySelector(".admin-phone-bar-title")?.textContent).toBe(
      "Record",
    );
  });
});

describe("local owner indicator in Data and Observability", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each(["/observability/status", "/data/records"])(
    "shows the laptop tile beside the wordmark on %s",
    (route) => {
      vi.stubGlobal("__LOCAL_OWNER_BUILD__", true);
      const host = document.createElement("div");
      host.innerHTML = renderToStaticMarkup(
        <AdminShell currentRoute={route} title="Record" localOwner>
          <div>Content</div>
        </AdminShell>,
      );
      const tiles = host.querySelectorAll("[data-admin-local-owner]");
      // Beside the sidebar wordmark and the phone wordmark.
      expect(tiles).toHaveLength(2);
      for (const tile of tiles) {
        expect(
          tile.closest(".editorial-identity-end, .admin-phone-bar"),
        ).not.toBeNull();
        expect(
          tile.querySelector('[role="img"]')?.getAttribute("aria-label"),
        ).toBe("Local owner");
        expect(tile.querySelector("button")).toBeNull();
      }
      host.innerHTML = renderToStaticMarkup(shell(route));
      expect(host.querySelector("[data-admin-local-owner]")).toBeNull();
    },
  );
});
