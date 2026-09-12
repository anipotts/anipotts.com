// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorialWorkspaceShell } from "./EditorialWorkspaceShell";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
describe("responsive workspace navigation", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value() {
        this.open = true;
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value() {
        this.open = false;
      },
    });
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
      "Adminani potts",
    );
    expect(
      host.querySelector(
        'button[aria-label="Search"], button[aria-label="Search content"]',
      ),
    ).toBeNull();
    expect(
      [...host.querySelectorAll("button")].some(
        (button) => button.textContent === "Search",
      ),
    ).toBe(false);
    const toggle = topbar.parentElement!.lastElementChild as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    act(() => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const controlled = toggle.getAttribute("aria-controls");
    expect(controlled).toBeTruthy();
    const drawer = document.getElementById(controlled!);
    expect(drawer).not.toBeNull();
    expect(drawer?.textContent).toContain("Writing");
    expect(drawer?.querySelector('a[href="/newsletter"]')).not.toBeNull();
    // Browser Escape raises the native dialog cancel event.
    act(() =>
      drawer!.dispatchEvent(
        new Event("cancel", { bubbles: true, cancelable: true }),
      ),
    );
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
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
    const identity = expand.closest(".editorial-workspace-identity")!;
    expect(identity).not.toBeNull();
    expect(identity.querySelector("button")).toBe(expand);
    for (const control of [
      identity.querySelector(".editorial-workspace-brand"),
      identity.querySelector(".admin-workspace-selector"),
      identity.querySelector('button[aria-label="Search"]'),
    ]) {
      expect(control).not.toBeNull();
      expect(
        expand.compareDocumentPosition(control!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).not.toBe(0);
    }
    act(() => expand.click());
    expect(localStorage.getItem("admin:sidebar-collapsed")).toBe("false");
    render(vi.fn(), "remounted");
    expect(
      host
        .querySelector(".editorial-workspace-shell")
        ?.getAttribute("data-sidebar-collapsed"),
    ).toBe("false");
  });
  it("keeps desktop search beside the workspace selector and identity above it", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });
    render();
    const identity = host.querySelector(".editorial-workspace-identity")!;
    const selector = identity.querySelector(".admin-workspace-selector")!;
    const search = identity.querySelector('button[aria-label="Search"]');
    const collapse = identity.querySelector(
      'button[aria-label="Collapse sidebar"]',
    );
    expect(search).not.toBeNull();
    expect(collapse).not.toBeNull();
    expect(selector.parentElement?.contains(search)).toBe(true);
    expect(selector.parentElement?.contains(collapse)).toBe(false);
    expect(
      identity.querySelectorAll('button[aria-label="Search"]'),
    ).toHaveLength(1);
    const announce = vi.fn();
    document.addEventListener("admin:search", announce);
    act(() => (search as HTMLButtonElement).click());
    document.removeEventListener("admin:search", announce);
    expect(announce).toHaveBeenCalledTimes(1);
  });
  it("offers direct appearance choices and an attached live-site tab", () => {
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
    expect(live.textContent).toBe("anipotts.com");
    expect(live.closest(".editorial-site-appearance")).not.toBeNull();
    act(() =>
      (
        host.querySelector(
          'button[aria-label="Collapse sidebar"]',
        ) as HTMLButtonElement
      ).click(),
    );
    const collapsedLive = host.querySelector('a[href="https://anipotts.com"]')!;
    expect(collapsedLive.getAttribute("aria-label")).toMatch(
      /Live site|anipotts.com/,
    );
    expect(
      collapsedLive.querySelectorAll('path[fill="currentColor"]'),
    ).toHaveLength(2);
  });
});
