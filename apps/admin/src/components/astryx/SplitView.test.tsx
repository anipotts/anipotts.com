// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SPLIT_VIEW_MIN_WIDTH,
  SplitPanel,
  SplitView,
  useSplitView,
} from "./SplitView";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
// jsdom serves modules over http, so the stylesheet is read from the package.
const shell = readFileSync(
  join(process.cwd(), "src/styles/shell.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");
const flat = shell.replace(/\s+/g, " ");

/** The declarations of the first rule whose prelude ends with `selector`,
 * inside `within` when given. */
function rule(selector: string, within = ""): string {
  const start = flat.indexOf(within);
  const at = flat.indexOf(`${selector} {`, start);
  expect(at, `${within} ${selector}`).toBeGreaterThan(-1);
  return flat.slice(at, flat.indexOf("}", at));
}

describe("SplitView", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders the list alone until an item opens beside it", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<SplitView list={<p>List</p>} />);
    const grid = host.querySelector(".admin-split > .admin-split-grid")!;
    expect(grid.getAttribute("data-panel-open")).toBe("false");
    expect(grid.querySelector(".admin-split-panel")).toBeNull();
    host.innerHTML = renderToStaticMarkup(
      <SplitView
        list={<p>List</p>}
        listClassName="workspace-list"
        panel={
          <SplitPanel header={<h2>Record</h2>} aria-label="Record">
            <p>Body</p>
          </SplitPanel>
        }
      />,
    );
    const open = host.querySelector(".admin-split-grid")!;
    expect(open.getAttribute("data-panel-open")).toBe("true");
    expect(
      [...open.children].map((child) => child.className.split(" ")),
    ).toEqual([["admin-split-list", "workspace-list"], ["admin-split-panel"]]);
    const panel = open.querySelector('section[aria-label="Record"]')!;
    expect([...panel.children].map((child) => child.className)).toEqual([
      "admin-split-panel-header",
      "admin-split-panel-body",
    ]);
  });

  it("tells the panel whether it sits beside the list", () => {
    let width = 1000;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const seen: boolean[] = [];
    function Probe() {
      seen.push(useSplitView());
      return null;
    }
    const spy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => ({ width }) as DOMRect);
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(<SplitView list={<Probe />} />));
    expect(seen.at(-1)).toBe(true);
    width = SPLIT_VIEW_MIN_WIDTH - 1;
    act(() => root.render(<SplitView key="narrow" list={<Probe />} />));
    expect(seen.at(-1)).toBe(false);
    act(() => root.unmount());
    spy.mockRestore();
  });

  it("scrolls an open panel on its own beside the list, under a pinned header", () => {
    expect(rule(".admin-split")).toContain(
      "container: admin-split / inline-size",
    );
    const wide = "@container admin-split (min-width: 960px)";
    expect(flat).toContain(wide);
    expect(SPLIT_VIEW_MIN_WIDTH).toBe(960);
    const panel = rule(
      '.admin-split-grid[data-panel-open="true"] > .admin-split-panel',
      wide,
    );
    expect(panel).toContain("position: sticky");
    expect(panel).toContain(
      "inset-block-start: calc(var(--admin-appbar-height, 0px) + var(--spacing-5))",
    );
    expect(panel).toContain("overflow-y: auto");
    expect(panel).toContain("overscroll-behavior: contain");
    // The room below the panel's own top (measured), else main's height.
    expect(panel).toMatch(
      /max-block-size: var\(\s*--admin-split-panel-room,\s*calc\( ?var\(--admin-main-block-size/,
    );
    const header = rule(
      '.admin-split-grid[data-panel-open="true"] .admin-split-panel-header',
      wide,
    );
    expect(header).toContain("position: sticky");
    expect(header).toContain("inset-block-start: 0");
    // Narrower, the open panel is the page and the list steps aside.
    expect(
      rule(
        '.admin-split-grid[data-panel-open="true"] > .admin-split-list',
        "@container admin-split (max-width: 959px)",
      ),
    ).toContain("display: none");
    // Main's height, for the panel's own height, follows the sidebar.
    expect(flat).toMatch(
      /\.editorial-workspace-shell\[data-sidebar-collapsed="false"\] \{ --admin-main-block-size: calc\(100dvh - var\(--spacing-3\)\);/,
    );
  });

  it("refits against the document below desktop and main after resizing, and disposes scroll listeners", () => {
    vi.stubGlobal("innerWidth", 1023);
    vi.stubGlobal("innerHeight", 800);
    let panelTop = 300;
    const scheduled: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      scheduled.push(callback);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("getComputedStyle", () => ({
      insetBlockStart: window.innerWidth <= 1023 ? "76px" : "20px",
      rowGap: "20px",
    }));
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        return {
          width: 1000,
          top: this.tagName === "SECTION" ? panelTop : -200,
          bottom: this.id === "astryx-app-shell-main" ? 700 : 1800,
        } as DOMRect;
      });
    const main = document.createElement("main");
    main.id = "astryx-app-shell-main";
    document.body.append(main);
    const root = createRoot(main);
    act(() =>
      root.render(
        <SplitView list={<p>List</p>} panel={<SplitPanel>Body</SplitPanel>} />,
      ),
    );
    const panel = main.querySelector<HTMLElement>(".admin-split-panel")!;
    expect(panel.style.getPropertyValue("--admin-split-panel-room")).toBe(
      "480px",
    );
    panelTop = 76;
    window.dispatchEvent(new Event("scroll"));
    scheduled.shift()!(0);
    expect(panel.style.getPropertyValue("--admin-split-panel-room")).toBe(
      "704px",
    );
    vi.stubGlobal("innerWidth", 1440);
    panelTop = 20;
    window.dispatchEvent(new Event("resize"));
    scheduled.shift()!(0);
    expect(panel.style.getPropertyValue("--admin-split-panel-room")).toBe(
      "660px",
    );
    panelTop = 100;
    main.dispatchEvent(new Event("scroll"));
    scheduled.shift()!(0);
    expect(panel.style.getPropertyValue("--admin-split-panel-room")).toBe(
      "580px",
    );
    act(() => root.unmount());
    window.dispatchEvent(new Event("scroll"));
    main.dispatchEvent(new Event("scroll"));
    expect(scheduled).toHaveLength(0);
    main.remove();
    rect.mockRestore();
  });
});
