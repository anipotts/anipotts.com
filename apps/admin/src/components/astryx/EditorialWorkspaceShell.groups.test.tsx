// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EditorialWorkspaceShell } from "./EditorialWorkspaceShell";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
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
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function render(path: string, area: "content" | "newsletter" = "content") {
  history.replaceState(null, "", path);
  act(() =>
    root.render(
      <EditorialWorkspaceShell
        area={area}
        mode="light"
        changeTheme={() => {}}
        siteHref="https://anipotts.com"
        localPreview
        palette={<></>}
      >
        <p>Library</p>
      </EditorialWorkspaceShell>,
    ),
  );
}
function link(label: string) {
  const anchor = [
    ...host.querySelectorAll<HTMLAnchorElement>("a.astryx-side-nav-item"),
  ].find((item) => item.textContent === label);
  expect(anchor).toBeDefined();
  return new URL(anchor!.getAttribute("href")!, location.origin);
}
it("clears source-only sections/status when switching groups but preserves query, sort, and theme", () => {
  render(
    "/content?group=work&sections=work&status=featured&q=agent&sort=title&theme=dark",
  );
  const target = link("Writing");
  expect(target.pathname).toBe("/content");
  expect(Object.fromEntries(target.searchParams)).toEqual({
    group: "writing",
    q: "agent",
    sort: "title",
    theme: "dark",
  });
  expect(link("Projects").searchParams.get("status")).toBe("featured");
  expect(link("Projects").searchParams.get("sections")).toBe("work");
});
it("clears an explicitly empty sections filter when leaving Overview", () => {
  render("/content?sections=&status=hidden&sort=updated");
  expect(link("Pages").searchParams.has("sections")).toBe(false);
  expect(link("Pages").searchParams.has("status")).toBe(false);
  expect(link("Overview").searchParams.get("sections")).toBe("");
});
it("treats newsletter and Overview as distinct libraries despite their shared default group", () => {
  render(
    "/newsletter?sections=newsletter&status=draft&q=notes&sort=updated",
    "newsletter",
  );
  expect(Object.fromEntries(link("Overview").searchParams)).toEqual({
    q: "notes",
    sort: "updated",
  });
  expect(link("Newsletter").searchParams.get("status")).toBe("draft");
});
it("uses the editor return destination to retain same-library filters and clean other groups", () => {
  render(
    "/content/writing/post?returnTo=" +
      encodeURIComponent(
        "/content?group=writing&sections=writing&status=scheduled&q=notes&sort=title",
      ),
  );
  expect(link("Writing").searchParams.get("status")).toBe("scheduled");
  expect(link("Projects").searchParams.has("status")).toBe(false);
  expect(link("Projects").searchParams.get("q")).toBe("notes");
});
