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
          localOwner
        >
          <p>Record</p>
        </EditorialWorkspaceShell>,
      ),
    );
  }
  it.each([false, true])(
    "keeps the machine and Overview in the intended DOM order for collapsed=%s",
    (collapsed) => {
      vi.stubGlobal("__LOCAL_OWNER_BUILD__", true);
      localStorage.setItem("admin:sidebar-collapsed", String(collapsed));
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: 1280,
      });
      render();
      const machine = host.querySelector<HTMLElement>(
        "[data-admin-local-owner]",
      )!;
      const overview = host.querySelector<HTMLElement>(
        'a[data-sidebar-id="overview"]',
      )!;
      const search = host.querySelector<HTMLElement>(
        ".editorial-header-search",
      )!;
      expect(machine).not.toBeNull();
      expect(overview).not.toBeNull();
      expect(
        search.compareDocumentPosition(overview) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      if (collapsed) {
        expect(
          machine.parentElement?.classList.contains("admin-unified-nav"),
        ).toBe(true);
        expect(machine.previousElementSibling?.contains(overview)).toBe(true);
        expect(
          overview.compareDocumentPosition(machine) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(machine.querySelector("a,button,[tabindex]")).toBeNull();
        act(() => {
          overview.focus();
          overview.dispatchEvent(
            new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
          );
        });
        expect(document.activeElement).toBe(
          host.querySelector('a[data-sidebar-id="content:website"]'),
        );
      } else {
        expect(
          machine.parentElement?.classList.contains("editorial-identity-end"),
        ).toBe(true);
        expect(
          machine.compareDocumentPosition(overview) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      }
    },
  );

  it.each([390, 640])(
    "shares appbar search, theme and unified drawer at %ipx",
    (width) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      const change = vi.fn();
      render(change);
      const bar = host.querySelector(".admin-phone-bar")!;
      expect(bar.closest('[role="banner"]')).not.toBeNull();
      expect(host.querySelector(".admin-phone-pages")).toBeNull();
      expect(host.querySelector(".astryx-app-shell-sidenav")).toBeNull();
      const announce = vi.fn();
      document.addEventListener("admin:search", announce);
      act(() =>
        (
          bar.querySelector('[aria-label="Search"]') as HTMLButtonElement
        ).click(),
      );
      document.removeEventListener("admin:search", announce);
      expect(announce).toHaveBeenCalledTimes(1);
      act(() =>
        (
          bar.querySelector('[aria-label="Light theme"]') as HTMLButtonElement
        ).click(),
      );
      expect(change).toHaveBeenCalledExactlyOnceWith("dark");
      const menu = bar.querySelector(
        '[aria-label="Open navigation"]',
      ) as HTMLButtonElement;
      act(() => menu.click());
      expect(menu.getAttribute("aria-expanded")).toBe("true");
      const drawer = host.querySelector(
        "dialog.admin-navigation-drawer",
      ) as HTMLDialogElement;
      expect(drawer.open).toBe(true);
      expect(drawer.id).toBe(menu.getAttribute("aria-controls"));
      expect(drawer.querySelector('a[href="/data/records"]')).not.toBeNull();
      expect(
        drawer.querySelector('a[href="/observability/status"]'),
      ).not.toBeNull();
      // A navigation request held by unsaved edits must leave the drawer open.
      act(() =>
        window.dispatchEvent(
          new CustomEvent("admin:navigate", { detail: "/content/pages" }),
        ),
      );
      expect(menu.getAttribute("aria-expanded")).toBe("true");
      act(() =>
        drawer.dispatchEvent(
          new Event("cancel", { bubbles: false, cancelable: true }),
        ),
      );
      expect(menu.getAttribute("aria-expanded")).toBe("false");
      act(() => menu.click());
      act(() => window.dispatchEvent(new Event("admin:workspace-navigation")));
      expect(menu.getAttribute("aria-expanded")).toBe("false");
    },
  );
  it.each([
    [390, 1, 0],
    [1280, 0, 1],
  ])(
    "starts a page drawn in place at the top of its scroller at %ipx",
    (width, documentCalls, mainCalls) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      const scroll = vi.fn();
      vi.stubGlobal("scrollTo", scroll);
      const panel = vi.fn();
      render();
      const main = host.querySelector("#astryx-app-shell-main");
      if (main)
        Object.defineProperty(main, "scrollTop", {
          configurable: true,
          get: () => 0,
          set: panel,
        });
      act(() => {
        window.dispatchEvent(new Event("admin:workspace-navigation"));
      });
      // The document on phones, main's own panel beside the sidebar.
      expect(scroll).toHaveBeenCalledTimes(documentCalls);
      expect(panel).toHaveBeenCalledTimes(mainCalls);
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
  it.each([641, 768, 930, 1023])(
    "expands the inline sidebar at %ipx without opening a modal",
    (width) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      render();
      const shell = () => host.querySelector(".editorial-workspace-shell")!;
      const collapsed = () => shell().getAttribute("data-sidebar-collapsed");
      const drawer = () =>
        host.querySelector<HTMLDialogElement>(
          "dialog.admin-navigation-drawer",
        )!;
      expect(collapsed()).toBe("true");
      act(() =>
        host
          .querySelector<HTMLButtonElement>(
            'button[aria-label="Expand sidebar"]',
          )!
          .click(),
      );
      expect(collapsed()).toBe("false");
      expect(drawer().open).toBe(false);
      expect(host.querySelector(".admin-tablet-sidebar")).toBeNull();
      expect(localStorage.getItem("admin:sidebar-collapsed")).toBe("false");
      const nav = shell().querySelector(".astryx-app-shell-sidenav")!;
      expect(nav.querySelector(".approved-workspace-header")).not.toBeNull();
      expect(nav.querySelector('[aria-label="Search"]')).not.toBeNull();
      // A route remount keeps the expanded sidebar rather than reverting to a rail.
      render(vi.fn(), "remounted");
      expect(collapsed()).toBe("false");
      act(() =>
        host
          .querySelector<HTMLButtonElement>(
            'button[aria-label="Collapse sidebar"]',
          )!
          .click(),
      );
      expect(collapsed()).toBe("true");
      expect(drawer().open).toBe(false);
      expect(localStorage.getItem("admin:sidebar-collapsed")).toBe("true");
    },
  );
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
    const links = [...host.querySelectorAll(".astryx-app-shell-sidenav a")];
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
    [690, "false", "false"],
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
