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
  it.each([690, 768])(
    "keeps a compact mobile identity with one navigation toggle at %ipx",
    (width) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      render();
      // Admin's own header replaces AppShell's hydration-time top bar.
      expect(
        host.querySelector('.astryx-side-nav[data-mode="topbar"]'),
      ).toBeNull();
      const topbar = host.querySelector(".admin-mobile-header")!;
      expect(topbar).not.toBeNull();
      expect(topbar.closest('[role="banner"]')).not.toBeNull();
      expect(
        topbar.querySelector('button[aria-label="Collapse sidebar"]'),
      ).toBeNull();
      expect(topbar.querySelector(".admin-bracket-wordmark")?.textContent).toBe(
        "[admin]",
      );
      expect(
        topbar.querySelector(".admin-workspace-selector")?.textContent,
      ).toContain("Content");
      expect(
        host.querySelectorAll('button[aria-label="Open navigation"]'),
      ).toHaveLength(1);
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
      const toggle = topbar.querySelector(
        'button[aria-label="Open navigation"]',
      ) as HTMLButtonElement;
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
    },
  );
  it.each([390, 768])(
    "never renders the collapsed rail inside the %ipx drawer, even when a rail was saved",
    (width) => {
      localStorage.setItem("admin:sidebar-collapsed", "true");
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      render();
      expect(
        host
          .querySelector(".editorial-workspace-shell")
          ?.getAttribute("data-sidebar-collapsed"),
      ).toBe("false");
      localStorage.removeItem("admin:sidebar-collapsed");
    },
  );
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
  it("keeps desktop search below the workspace selector and identity above it", () => {
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
    expect(identity.contains(search)).toBe(true);
    // The collapse control lives in the wordmark row; the workspace menu has a
    // full-width row of its own.
    expect(selector.closest(".editorial-identity-primary-row")).toBeNull();
    expect(collapse?.closest(".editorial-identity-primary-row")).not.toBeNull();
    expect(
      identity.querySelectorAll('button[aria-label="Search"]'),
    ).toHaveLength(1);
    const announce = vi.fn();
    document.addEventListener("admin:search", announce);
    act(() => (search as HTMLButtonElement).click());
    document.removeEventListener("admin:search", announce);
    expect(announce).toHaveBeenCalledTimes(1);
  });
  it("offers appearance as a sidebar menu and a header visit-site link", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });
    const change = vi.fn();
    render(change);
    // One control at the foot of the sidebar, shaped like the workspace menu:
    // it names the current choice and opens a single-choice menu.
    const appearance = host.querySelector(
      ".editorial-workspace-utilities .admin-appearance-menu",
    ) as HTMLButtonElement;
    expect(appearance).not.toBeNull();
    expect(appearance.classList).toContain("admin-sidebar-menu");
    expect(
      host.querySelector(".admin-workspace-selector")?.classList,
    ).toContain("admin-sidebar-menu");
    expect(appearance.getAttribute("aria-label")).toMatch(/^Theme: /);
    expect(appearance.getAttribute("aria-haspopup")).toBe("menu");
    act(() => appearance.click());
    const menu = document.getElementById(
      appearance.getAttribute("aria-controls") ?? "",
    )!;
    expect(menu.getAttribute("role")).toBe("menu");
    const choices = [
      ...menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
    ];
    expect(choices.map((choice) => choice.textContent)).toEqual([
      "Light",
      "Dark",
      "System",
    ]);
    act(() => choices[1]!.click());
    expect(change).toHaveBeenCalledExactlyOnceWith("dark");
    const identity = host.querySelector(".editorial-workspace-identity")!;
    expect(identity.querySelector("svg")).not.toBeNull(); // Native collapse glyph, no AP paths.
    expect(identity.querySelector('path[fill="currentColor"]')).toBeNull();
    const links = [...host.querySelectorAll("a")];
    const writing = links.find((link) => link.textContent === "Writing")!;
    const newsletter = links.find((link) => link.textContent === "Newsletter")!;
    expect(writing.closest(".astryx-side-nav-section")).toBe(
      newsletter.closest(".astryx-side-nav-section"),
    );
    const live = host.querySelector('a[aria-label="Visit site"]')!;
    expect(live.querySelector("rect")).toBeNull();
    expect(live.getAttribute("aria-label")).toBe("Visit site");
    expect(live.closest(".approved-workspace-header")).not.toBeNull();
    act(() =>
      (
        host.querySelector(
          'button[aria-label="Collapse sidebar"]',
        ) as HTMLButtonElement
      ).click(),
    );
    expect(host.querySelector('a[aria-label="Visit site"]')).toBeNull();
  });

  it.each([
    [1024, null, "true"],
    [1024, "false", "false"],
    [1440, "true", "true"],
    [1440, null, "false"],
    [690, "true", "false"],
  ])(
    "chooses the rail at %ipx with saved %s in one commit after hydration",
    async (width, saved, expected) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      if (saved !== null)
        localStorage.setItem("admin:sidebar-collapsed", saved);
      const seen: string[] = [];
      const observer = new MutationObserver(() => {
        const shell = host.querySelector(".editorial-workspace-shell");
        if (shell)
          seen.push(
            `${shell.getAttribute("data-sidebar-ready")}:${shell.getAttribute("data-sidebar-collapsed")}`,
          );
      });
      observer.observe(host, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-sidebar-ready", "data-sidebar-collapsed"],
      });
      render();
      await act(async () => {});
      observer.disconnect();
      const shell = host.querySelector(".editorial-workspace-shell")!;
      expect(shell.getAttribute("data-sidebar-ready")).toBe("true");
      expect(shell.getAttribute("data-sidebar-collapsed")).toBe(expected);
      // Once ready, the rail value never changes again during hydration.
      const ready = seen.filter((entry) => entry.startsWith("true:"));
      expect(new Set(ready)).toEqual(new Set([`true:${expected}`]));
    },
  );
});
