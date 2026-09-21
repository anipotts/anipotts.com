// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UnifiedNavigation,
  selectedSidebarItem,
  sidebarSearchEntries,
} from "./UnifiedSidebar";
import type { SidebarGroupId } from "../../lib/admin-sidebar";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
  localStorage.clear();
  sessionStorage.clear();
  delete document.documentElement.dataset.adminNavClosed;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function render(activeGroup: SidebarGroupId = "content", selected = "writing") {
  act(() =>
    root.render(
      <UnifiedNavigation
        rail={false}
        activeGroup={activeGroup}
        selected={selected}
      />,
    ),
  );
}
const heading = (id: string) =>
  host.querySelector<HTMLButtonElement>(`[data-sidebar-group="${id}"]`)!;
const page = (id: string) =>
  host.querySelector<HTMLAnchorElement>(`[data-sidebar-id="${id}"]`)!;
const key = (target: Element, name: string) =>
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: name, bubbles: true }),
    );
  });

describe("unified sidebar", () => {
  it("renders Content, Data and Observability in order, every group open", () => {
    const html = renderToStaticMarkup(
      <UnifiedNavigation rail={false} activeGroup="content" />,
    );
    host.innerHTML = html;
    expect(
      [...host.querySelectorAll("[data-sidebar-group]")].map(
        (element) => element.textContent,
      ),
    ).toEqual(["Content", "Data", "Observability"]);
    for (const element of host.querySelectorAll("[data-sidebar-group]"))
      expect(element.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelectorAll("a[data-sidebar-id]")).toHaveLength(14);
  });

  it("marks only the active page with aria-current", () => {
    render("life", "people");
    const current = host.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.getAttribute("href")).toBe("/life/people");
  });

  it("saves each group's open state and always opens the active page's group", () => {
    render();
    act(() => heading("life").click());
    expect(heading("life").getAttribute("aria-expanded")).toBe("false");
    expect(JSON.parse(localStorage.getItem("admin:sidebar-groups")!)).toEqual({
      content: false,
      life: true,
      operations: false,
    });
    act(() => root.unmount());
    root = createRoot(host);
    render("content");
    expect(heading("life").getAttribute("aria-expanded")).toBe("false");
    act(() => root.unmount());
    root = createRoot(host);
    render("life", "people");
    expect(heading("life").getAttribute("aria-expanded")).toBe("true");
  });

  it("drops the prepaint hold once React owns the state", () => {
    localStorage.setItem("admin:sidebar-groups", '{"operations":true}');
    document.documentElement.dataset.adminNavClosed = "operations";
    render();
    expect(document.documentElement.dataset.adminNavClosed).toBeUndefined();
    expect(heading("operations").getAttribute("aria-expanded")).toBe("false");
  });

  it("moves with the arrow keys, skipping pages in closed groups", () => {
    localStorage.setItem("admin:sidebar-groups", '{"life":true}');
    render();
    page("content:newsletter").focus();
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement).toBe(heading("life"));
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement).toBe(heading("operations"));
    key(document.activeElement!, "ArrowUp");
    expect(document.activeElement).toBe(heading("life"));
    // Right opens a closed group, then enters it.
    key(document.activeElement!, "ArrowRight");
    expect(heading("life").getAttribute("aria-expanded")).toBe("true");
    key(document.activeElement!, "ArrowRight");
    expect(document.activeElement).toBe(page("life:overview"));
    // Left returns to the heading, then closes the group.
    key(document.activeElement!, "ArrowLeft");
    expect(document.activeElement).toBe(heading("life"));
    key(document.activeElement!, "ArrowLeft");
    expect(heading("life").getAttribute("aria-expanded")).toBe("false");
    key(document.activeElement!, "Home");
    expect(document.activeElement).toBe(heading("content"));
    key(document.activeElement!, "End");
    expect(document.activeElement).toBe(page("operations:loops"));
  });

  it("returns focus to the page opened from the keyboard", () => {
    render();
    const link = page("life:people");
    link.addEventListener("click", (event) => event.preventDefault());
    // Keyboard activation reaches a link as a click with detail 0.
    act(() => {
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }),
      );
    });
    expect(sessionStorage.getItem("admin:sidebar-focus")).toBe("life:people");
    act(() => root.unmount());
    root = createRoot(host);
    render("life", "people");
    expect(document.activeElement).toBe(page("life:people"));
    expect(sessionStorage.getItem("admin:sidebar-focus")).toBeNull();
  });

  it("leaves pointer navigation to the browser", () => {
    render();
    const link = page("life:people");
    link.addEventListener("click", (event) => event.preventDefault());
    act(() => {
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
      );
    });
    expect(sessionStorage.getItem("admin:sidebar-focus")).toBeNull();
  });

  it("shows the rail as unlabeled runs of icons", () => {
    host.innerHTML = renderToStaticMarkup(
      <UnifiedNavigation rail activeGroup="operations" selected="loops" />,
    );
    expect(host.querySelectorAll("[data-sidebar-group]")).toHaveLength(0);
    expect(host.querySelectorAll("[data-sidebar-section]")).toHaveLength(3);
  });
});

describe("sidebar selection and search", () => {
  it.each([
    ["/operations/observability", "machines"],
    ["/operations/observability?view=loops", "loops"],
    ["/operations/observability?view=loops-extra", undefined],
    ["/life", "overview"],
    ["/life/timeline", "timeline"],
    ["/life/health", undefined],
    ["/work?view=machines", undefined],
  ])("%s selects %s", (route, expected) => {
    expect(selectedSidebarItem(route)).toBe(expected);
  });

  it("lists every sidebar page once for every palette", () => {
    const hrefs = sidebarSearchEntries.map((entry) => entry.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(sidebarSearchEntries.map((entry) => entry.label)).toContain(
      "Data overview",
    );
  });
});
