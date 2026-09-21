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
it("clears source-only sections/status when switching libraries but preserves query, sort, and theme", () => {
  render(
    "/content/projects?sections=work&status=featured&q=agent&sort=title&theme=dark",
  );
  const target = link("Writing");
  expect(target.pathname).toBe("/content/writing");
  expect(Object.fromEntries(target.searchParams)).toEqual({
    q: "agent",
    sort: "title",
    theme: "dark",
  });
  expect(link("Projects").pathname).toBe("/content/projects");
  expect(link("Projects").searchParams.get("status")).toBe("featured");
  expect(link("Projects").searchParams.get("sections")).toBe("work");
});
it("clears an explicitly empty sections filter when leaving Pages", () => {
  render("/content/pages?sections=&status=hidden&sort=updated");
  expect(link("Writing").searchParams.has("sections")).toBe(false);
  expect(link("Writing").searchParams.has("status")).toBe(false);
  expect(link("Pages").searchParams.get("sections")).toBe("");
  expect(link("Pages").searchParams.get("status")).toBe("hidden");
});
it("treats Newsletter and Pages as distinct libraries", () => {
  render(
    "/content/newsletter?sections=newsletter&status=draft&q=notes&sort=updated",
    "newsletter",
  );
  expect(link("Pages").pathname).toBe("/content/pages");
  expect(Object.fromEntries(link("Pages").searchParams)).toEqual({
    q: "notes",
    sort: "updated",
  });
  expect(link("Newsletter").pathname).toBe("/content/newsletter");
  expect(link("Newsletter").searchParams.get("status")).toBe("draft");
});
it("links the one overview at the root, with no library state", () => {
  render("/content/writing?q=notes");
  expect(link("Overview").pathname).toBe("/");
  expect(link("Overview").search).toBe("");
});
it.each([
  "/content/writing?sections=writing&status=scheduled&q=notes&sort=title",
  // A legacy group link kept in an old editor URL still names its library.
  "/content?group=writing&sections=writing&status=scheduled&q=notes&sort=title",
])(
  "uses the editor return destination %s to retain same-library filters and clean other libraries",
  (returnTo) => {
    render("/content/writing/post?returnTo=" + encodeURIComponent(returnTo));
    expect(link("Writing").searchParams.get("status")).toBe("scheduled");
    expect(link("Projects").searchParams.has("status")).toBe(false);
    expect(link("Projects").searchParams.get("q")).toBe("notes");
  },
);
