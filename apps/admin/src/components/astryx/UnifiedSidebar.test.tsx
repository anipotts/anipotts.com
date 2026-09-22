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
    expect(host.querySelectorAll("a[data-sidebar-id]")).toHaveLength(12);
    expect(
      host.querySelector('a[data-sidebar-id="overview"]')?.getAttribute("href"),
    ).toBe("/");
  });

  it("marks only the active page with aria-current", () => {
    render("data", "sources");
    const current = host.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.getAttribute("href")).toBe("/data/sources");
  });

  it("saves each group's open state and always opens the active page's group", () => {
    render();
    act(() => heading("data").click());
    expect(heading("data").getAttribute("aria-expanded")).toBe("false");
    expect(JSON.parse(localStorage.getItem("admin:sidebar-groups")!)).toEqual({
      content: false,
      data: true,
      observability: false,
    });
    act(() => root.unmount());
    root = createRoot(host);
    render("content");
    expect(heading("data").getAttribute("aria-expanded")).toBe("false");
    act(() => root.unmount());
    root = createRoot(host);
    render("data", "records");
    expect(heading("data").getAttribute("aria-expanded")).toBe("true");
  });

  it("drops the prepaint hold once React owns the state", () => {
    localStorage.setItem("admin:sidebar-groups", '{"observability":true}');
    document.documentElement.dataset.adminNavClosed = "observability";
    render();
    expect(document.documentElement.dataset.adminNavClosed).toBeUndefined();
    expect(heading("observability").getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("moves with the arrow keys, skipping pages in closed groups", () => {
    localStorage.setItem("admin:sidebar-groups", '{"data":true}');
    render();
    page("content:newsletter").focus();
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement).toBe(heading("data"));
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement).toBe(heading("observability"));
    key(document.activeElement!, "ArrowUp");
    expect(document.activeElement).toBe(heading("data"));
    // Right opens a closed group, then enters it.
    key(document.activeElement!, "ArrowRight");
    expect(heading("data").getAttribute("aria-expanded")).toBe("true");
    key(document.activeElement!, "ArrowRight");
    expect(document.activeElement).toBe(page("data:records"));
    // Left returns to the heading, then closes the group.
    key(document.activeElement!, "ArrowLeft");
    expect(document.activeElement).toBe(heading("data"));
    key(document.activeElement!, "ArrowLeft");
    expect(heading("data").getAttribute("aria-expanded")).toBe("false");
    key(document.activeElement!, "Home");
    expect(document.activeElement).toBe(page("overview"));
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement).toBe(heading("content"));
    key(document.activeElement!, "End");
    expect(document.activeElement).toBe(page("observability:alerts"));
  });

  it("returns focus to the page opened from the keyboard", () => {
    render();
    const link = page("data:sources");
    link.addEventListener("click", (event) => event.preventDefault());
    // Keyboard activation reaches a link as a click with detail 0.
    act(() => {
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }),
      );
    });
    expect(sessionStorage.getItem("admin:sidebar-focus")).toBe("data:sources");
    act(() => root.unmount());
    root = createRoot(host);
    render("data", "sources");
    expect(document.activeElement).toBe(page("data:sources"));
    expect(sessionStorage.getItem("admin:sidebar-focus")).toBeNull();
  });

  it("leaves pointer navigation to the browser", () => {
    render();
    const link = page("data:sources");
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
      <UnifiedNavigation rail activeGroup="observability" selected="alerts" />,
    );
    expect(host.querySelectorAll("[data-sidebar-group]")).toHaveLength(0);
    expect(host.querySelectorAll("[data-sidebar-section]")).toHaveLength(3);
  });
});

describe("sidebar selection and search", () => {
  it.each([
    ["/", "overview"],
    ["/observability/status", "status"],
    ["/observability/activity?x=1", "activity"],
    ["/observability/alerts", "alerts"],
    ["/observability/status-old", undefined],
    ["/data/records", "records"],
    ["/data/records/rec-00000000000000000000000000000001", "records"],
    ["/data/sources", "sources"],
    ["/life/people", undefined],
    ["/work?view=machines", undefined],
  ])("%s selects %s", (route, expected) => {
    expect(selectedSidebarItem(route)).toBe(expected);
  });

  it("lists every sidebar page once for every palette", () => {
    const hrefs = sidebarSearchEntries.map((entry) => entry.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toEqual([
      "/",
      "/content/pages",
      "/content/writing",
      "/content/projects",
      "/content/newsletter",
      "/data/records",
      "/data/sources",
      "/data/health",
      "/data/knowledge",
      "/observability/status",
      "/observability/activity",
      "/observability/alerts",
    ]);
  });
});
