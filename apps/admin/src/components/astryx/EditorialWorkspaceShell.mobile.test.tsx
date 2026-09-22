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
          localPreview
        >
          <p>Record</p>
        </EditorialWorkspaceShell>,
      ),
    );
  }
  it.each([390, 640])(
    "has no sidebar, drawer or menu at %ipx; the top bar searches",
    (width) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      render();
      // AppShell's own top bar and drawer never mount.
      expect(
        host.querySelector('.astryx-side-nav[data-mode="topbar"]'),
      ).toBeNull();
      expect(document.querySelector(".astryx-mobile-nav")).toBeNull();
      expect(host.querySelector(".astryx-app-shell-sidenav")).toBeNull();
      expect(host.textContent).not.toContain("Open navigation");
      const bar = host.querySelector(".admin-phone-bar")!;
      expect(bar.closest('[role="banner"]')).not.toBeNull();
      expect(bar.querySelector(".admin-bracket-wordmark")?.textContent).toBe(
        "[A]",
      );
      const announce = vi.fn();
      document.addEventListener("admin:search", announce);
      act(() =>
        (
          bar.querySelector('button[aria-label="Search"]') as HTMLButtonElement
        ).click(),
      );
      document.removeEventListener("admin:search", announce);
      expect(announce).toHaveBeenCalledTimes(1);
      // One tap reaches any workspace from the bar, and the current one's
      // pages from the chips under it.
      const tabs = bar.querySelector('nav[aria-label="Workspaces"]')!;
      expect(
        [
          ...tabs.querySelectorAll<HTMLAnchorElement>(".admin-phone-workspace"),
        ].map((tab) => tab.getAttribute("href")),
      ).toEqual([
        expect.stringMatching(/^\/content/),
        "/data/records",
        "/observability/status",
      ]);
      expect(
        [
          ...host.querySelectorAll(
            'nav.admin-phone-pages[aria-label="Content"] .admin-phone-page',
          ),
        ].map((chip) => chip.textContent),
      ).toEqual(["Pages", "Writing", "Projects", "Newsletter"]);
    },
  );
  it.each([
    [390, 1],
    [1280, 0],
  ])(
    "starts a page drawn in place at the top of the document at %ipx",
    (width, calls) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      const scroll = vi.fn();
      vi.stubGlobal("scrollTo", scroll);
      render();
      act(() => {
        window.dispatchEvent(new Event("admin:workspace-navigation"));
      });
      expect(scroll).toHaveBeenCalledTimes(calls);
    },
  );
  it.each([390, 640])(
    "never renders the collapsed rail at %ipx, even when a rail was saved",
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
  it("opens the full sidebar for the moment on a tablet and saves the choice for wider screens", () => {
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
      identity.querySelector('button[aria-label="Search"]'),
    ]) {
      expect(control).not.toBeNull();
      expect(
        expand.compareDocumentPosition(control!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).not.toBe(0);
    }
    act(() => expand.click());
    const collapsed = () =>
      host
        .querySelector(".editorial-workspace-shell")
        ?.getAttribute("data-sidebar-collapsed");
    expect(collapsed()).toBe("false");
    expect(localStorage.getItem("admin:sidebar-collapsed")).toBe("false");
    // A tablet opens on the rail again: the saved expand would leave its
    // tables too little room.
    render(vi.fn(), "remounted");
    expect(collapsed()).toBe("true");
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1100,
    });
    render(vi.fn(), "wide");
    expect(collapsed()).toBe("false");
  });
  it("keeps desktop search below the identity row", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });
    render();
    const identity = host.querySelector(".editorial-workspace-identity")!;
    const search = identity.querySelector('button[aria-label="Search"]');
    const collapse = identity.querySelector(
      'button[aria-label="Collapse sidebar"]',
    );
    expect(search).not.toBeNull();
    expect(collapse).not.toBeNull();
    expect(identity.contains(search)).toBe(true);
    // The collapse control lives in the wordmark row; search has a full-width
    // row of its own.
    expect(search?.closest(".editorial-identity-primary-row")).toBeNull();
    expect(identity.querySelector(".admin-workspace-selector")).toBeNull();
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
  it("cycles the theme with one button and links no outside site", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });
    const change = vi.fn();
    render(change);
    expect(host.querySelector('[role="radiogroup"]')).toBeNull();
    const theme = host.querySelector<HTMLButtonElement>(
      ".editorial-workspace-utilities .admin-theme-cycle",
    )!;
    expect(theme.getAttribute("aria-label")).toBe("Light theme");
    act(() => theme.click());
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
    expect(host.querySelector('[aria-label="Visit site"]')).toBeNull();
    expect(host.querySelector('a[target="_blank"]')).toBeNull();
    const home = identity.querySelector<HTMLAnchorElement>(
      "a.admin-bracket-wordmark",
    )!;
    expect(home.getAttribute("href")).toBe("/");
  });

  it.each([
    [1024, null, "true"],
    [1024, "false", "false"],
    [1440, "true", "true"],
    [1440, null, "false"],
    [690, null, "true"],
    [640, "true", "false"],
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
