// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorialWorkspaceShell } from "./EditorialWorkspaceShell";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
describe("mobile Website topbar", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => {
        const min = /min-width:\s*(\d+)px/.exec(query);
        const max = /max-width:\s*(\d+)px/.exec(query);
        return {
          matches:
            (!min || window.innerWidth >= Number(min[1])) &&
            (!max || window.innerWidth <= Number(max[1])),
          media: query,
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
        };
      }),
    );
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 690,
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
  function render(changeTheme = vi.fn(), key = "shell") {
    act(() =>
      root.render(
        <EditorialWorkspaceShell
          key={key}
          area="content"
          mode="light"
          changeTheme={changeTheme}
          siteHref="https://anipotts.com"
          localPreview
        >
          <p>Record</p>
        </EditorialWorkspaceShell>,
      ),
    );
  }
  it("keeps a compact mobile identity with one navigation toggle and no search triggers", () => {
    render();
    const topbar = host.querySelector('.astryx-side-nav[data-mode="topbar"]')!;
    expect(topbar).not.toBeNull();
    expect(
      topbar.querySelector('button[aria-label="Collapse sidebar"]'),
    ).toBeNull();
    expect(topbar.querySelector(".astryx-side-nav-heading")?.textContent).toBe(
      "ani potts / admin",
    );
    expect(
      host.querySelector('button[aria-label="Search content"]'),
    ).toBeNull();
    expect(
      [...host.querySelectorAll("button")].some(
        (button) => button.textContent === "Search",
      ),
    ).toBe(false);
    expect(
      topbar.parentElement!.lastElementChild?.getAttribute("aria-expanded"),
    ).toBe("false");
  });
  it("persists explicit expansion and collapse independently of the tablet default", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 930,
    });
    render();
    expect(
      host
        .querySelector(".editorial-workspace-shell")
        ?.getAttribute("data-sidebar-collapsed"),
    ).toBe("true");
    const expand = host.querySelector(
      'button[aria-label="Expand sidebar"]',
    ) as HTMLButtonElement;
    expect(expand).not.toBeNull();
    expect(expand.closest(".editorial-workspace-identity")).not.toBeNull();
    act(() => expand.click());
    expect(localStorage.getItem("editorial:sidebar-collapsed")).toBe("false");
    render(vi.fn(), "remounted");
    expect(
      host
        .querySelector(".editorial-workspace-shell")
        ?.getAttribute("data-sidebar-collapsed"),
    ).toBe("false");
  });
  it("offers direct light dark and system choices and a monochrome AP live-site mark", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });
    const change = vi.fn();
    render(change);
    act(() =>
      (
        host.querySelector('button[aria-label="Dark"]') as HTMLButtonElement
      ).click(),
    );
    expect(change).toHaveBeenCalledExactlyOnceWith("dark");
    for (const label of ["Light", "Dark", "System"])
      expect(
        host.querySelector(`button[aria-label="${label}"]`),
      ).not.toBeNull();
    const identity = host.querySelector(".editorial-workspace-identity")!;
    expect(identity.querySelector("svg")).not.toBeNull(); // Native collapse glyph, no AP paths.
    expect(identity.querySelector('path[fill="currentColor"]')).toBeNull();
    const choices = host.querySelector(
      '.editorial-workspace-utilities [aria-label="Appearance"]',
    )!;
    expect(choices.querySelectorAll("button")).toHaveLength(3);
    const links = [...host.querySelectorAll("a")];
    const writing = links.find((link) => link.textContent === "Writing")!;
    const newsletter = links.find((link) => link.textContent === "Newsletter")!;
    expect(writing.closest(".astryx-side-nav-section")).toBe(
      newsletter.closest(".astryx-side-nav-section"),
    );
    const live = host.querySelector('a[aria-label="Live site"]')!;
    expect(live.querySelector("rect")).toBeNull();
    expect(live.querySelectorAll('path[fill="currentColor"]')).toHaveLength(2);
  });
});
