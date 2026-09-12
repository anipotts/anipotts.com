// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { navItems } from "../../data/admin";
import { AdminShell } from "./AdminShell";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const operational = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("./OperationalCommandPalette", () => ({
  OperationalCommandPalette: () => {
    operational.render();
    return null;
  },
}));
const shell = (route: string) => (
  <AdminShell
    chrome="admin"
    currentRoute={route}
    navItems={navItems}
    title="Record"
    localPreview
  >
    <div>Content</div>
  </AdminShell>
);

describe("shared Operations and Life shell", () => {
  it("renders the shared identity and only the three primary Operations destinations", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(shell("/operations/observability"));
    expect(host.querySelector('[data-workspace="operations"]')).not.toBeNull();
    expect(host.textContent).toContain("Admin");
    expect(host.textContent).toContain("ani potts");
    const navigation = host.querySelector(".astryx-side-nav-section")!;
    const links = [...navigation.querySelectorAll("a")];
    expect(links.map((link) => link.textContent)).toEqual([
      "Overview",
      "Machines",
      "Loops",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/operations/observability",
      "/operations/observability?view=machines",
      "/operations/observability?view=loops",
    ]);
    expect(new Set(links.map((link) => link.href)).size).toBe(3);
    expect(navigation.querySelector("details")).toBeNull();
  });
  it.each(["machines", "loops"])("selects only the %s destination", (view) => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      shell(`/operations/observability?view=${view}`),
    );
    const selected = host.querySelectorAll(
      '.astryx-side-nav-section a[aria-current="page"]',
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]?.getAttribute("href")).toBe(
      `/operations/observability?view=${view}`,
    );
  });
  it.each([
    "/work?view=machines",
    "/operations/observability?view=machines-old",
    "/operations/observability?view=loops-extra",
  ])(
    "does not select a destination from a partial route match: %s",
    (route) => {
      const host = document.createElement("div");
      host.innerHTML = renderToStaticMarkup(shell(route));
      expect(
        host.querySelectorAll(
          '.astryx-side-nav-section a[aria-current="page"]',
        ),
      ).toHaveLength(0);
    },
  );
  it("renders Life navigation without mounting the Operations search provider", () => {
    operational.render.mockClear();
    const markup = renderToStaticMarkup(shell("/life/people"));
    expect(markup).toContain('data-workspace="life"');
    expect(markup).toMatch(/href="\/life\/people"[^>]*aria-current="page"/);
    for (const section of [
      "projects",
      "places",
      "timeline",
      "sources",
      "preview",
    ])
      expect(markup).toContain(`href="/life/${section}"`);
    expect(markup).not.toContain('href="/inbox"');
    expect(operational.render).not.toHaveBeenCalled();
  });
  it("keeps auth outside the workspace and its search providers", () => {
    operational.render.mockClear();
    const markup = renderToStaticMarkup(
      <AdminShell
        chrome="auth"
        currentRoute="/auth/passkey"
        navItems={navItems}
        title="Sign in"
      >
        <p>Sign in</p>
      </AdminShell>,
    );
    expect(markup).toContain("admin-auth-frame");
    expect(markup).not.toContain("editorial-workspace-shell");
    expect(operational.render).not.toHaveBeenCalled();
  });
});
