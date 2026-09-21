// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  it.each([false, true])(
    "preserves route context unless header is hidden: %s",
    (hideHeader) => {
      const html = renderToStaticMarkup(
        <AdminShell
          chrome="admin"
          currentRoute="/proof"
          navItems={navItems}
          title="Proof"
          deck="This page is read-only."
          hideHeader={hideHeader}
          localPreview
        >
          <p>Records</p>
        </AdminShell>,
      );
      expect(html.includes("This page is read-only.")).toBe(!hideHeader);
    },
  );
  it("renders the shared identity and Status as the only Observability destination", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(shell("/operations/observability"));
    expect(host.querySelector('[data-workspace="operations"]')).not.toBeNull();
    expect(
      host.querySelector('.admin-bracket-wordmark[aria-label="Admin"]')
        ?.textContent,
    ).toBe("[admin]");
    const navigation = host.querySelector(".astryx-side-nav-section")!;
    const links = [...navigation.querySelectorAll("a")];
    expect(links.map((link) => link.textContent)).toEqual(["Status"]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/operations/observability",
    ]);
    expect(navigation.querySelector("details")).toBeNull();
  });
  it.each([
    "/operations/observability",
    "/operations/observability?fixture=ops_v1",
  ])("selects Status on its route: %s", (route) => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(shell(route));
    const selected = host.querySelectorAll(
      '.astryx-side-nav-section a[aria-current="page"]',
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]?.textContent).toBe("Status");
  });
  it.each(["/work?view=machines", "/operations/observability-old", "/proof"])(
    "does not select Status from a partial route match: %s",
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

describe("local owner indicator in Operations and Life", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each(["/operations/observability", "/life/people"])(
    "shows the non-dismissable local owner token on %s",
    (route) => {
      vi.stubGlobal("__LOCAL_OWNER_BUILD__", true);
      const host = document.createElement("div");
      host.innerHTML = renderToStaticMarkup(
        <AdminShell
          chrome="admin"
          currentRoute={route}
          navItems={navItems}
          title="Record"
          localOwner
        >
          <div>Content</div>
        </AdminShell>,
      );
      const token = host.querySelector("[data-admin-local-owner]");
      expect(token?.textContent).toBe("Local owner");
      expect(token?.getAttribute("role")).toBe("status");
      expect(token?.querySelector("button")).toBeNull();
      host.innerHTML = renderToStaticMarkup(shell(route));
      expect(host.querySelector("[data-admin-local-owner]")).toBeNull();
    },
  );
});
