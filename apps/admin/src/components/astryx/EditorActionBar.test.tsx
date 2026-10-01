// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorActionBar, type EditorActionBarProps } from "./EditorActionBar";
import { AdminThemeControls } from "./ThemeControl";

const observations: {
  node: Element;
  notify: () => void;
  disconnect: ReturnType<typeof vi.fn>;
}[] = [];

describe("shared editor action bar", () => {
  let host: HTMLElement;
  let root: Root;
  let compact: boolean;
  let shows: ReturnType<typeof vi.fn>;
  let mounted: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    compact = false;
    observations.length = 0;
    vi.stubGlobal(
      "matchMedia",
      vi.fn((media: string) => ({
        matches: media.includes("max-width") ? compact : false,
        media,
        addEventListener() {},
        removeEventListener() {},
      })),
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        private callback: () => void;
        disconnect = vi.fn();
        constructor(callback: () => void) {
          this.callback = callback;
        }
        observe(node: Element) {
          observations.push({
            node,
            notify: this.callback,
            disconnect: this.disconnect,
          });
        }
        unobserve() {}
      },
    );
    shows = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "showPopover", {
      configurable: true,
      value: shows,
    });
    Object.defineProperty(HTMLElement.prototype, "hidePopover", {
      configurable: true,
      value: vi.fn(),
    });
    host = document.createElement("section");
    host.className = "editor-workspace";
    document.body.append(host);
    root = createRoot(host);
    mounted = true;
  });

  afterEach(() => {
    if (mounted) act(() => root.unmount());
    host.remove();
    delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover;
    delete (HTMLElement.prototype as Partial<HTMLElement>).hidePopover;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function render(props: Partial<EditorActionBarProps> = {}) {
    act(() =>
      root.render(
        <EditorActionBar
          back={{ href: "/content?group=writing", label: "Back to Writing" }}
          title="A deliberately long article title with enough context to identify the record"
          save="saved-privately"
          {...props}
        />,
      ),
    );
  }

  it.each([false, true])(
    "keeps full record identity and save evidence in preview at compact=%s",
    (isCompact) => {
      compact = isCompact;
      render({ preview: { isPressed: true, onChange: vi.fn() } });
      expect(host.querySelector("h1")?.textContent).toBe(
        "A deliberately long article title with enough context to identify the record",
      );
      expect(host.querySelector("[data-fit]")).toBeNull();
      expect(host.querySelector(".editor-save-status")?.textContent).toBe(
        "Saved privately",
      );
      expect(host.querySelector(".editor-save-status .sr-only")).toBeNull();
      expect(
        host
          .querySelector('button[aria-label="Preview"]')
          ?.getAttribute("aria-pressed"),
      ).toBe("true");
    },
  );

  it("keeps one-click theme access inside the mobile record toolbar", () => {
    compact = true;
    const changeTheme = vi.fn();
    act(() =>
      root.render(
        <AdminThemeControls.Provider value={{ mode: "dark", changeTheme }}>
          <EditorActionBar
            back={{ href: "/content/writing", label: "Back to Writing" }}
            title="Record"
          />
        </AdminThemeControls.Provider>,
      ),
    );
    const theme = host.querySelector<HTMLButtonElement>(
      '.editor-bar-actions button[aria-label="Dark theme"]',
    )!;
    expect(theme.classList.contains("editor-bar-theme")).toBe(true);
    expect(theme.hasAttribute("aria-haspopup")).toBe(false);
    act(() => theme.click());
    expect(changeTheme).toHaveBeenCalledExactlyOnceWith("system");
  });

  it("exposes Properties and History without opening overflow and keeps their state", () => {
    const properties = vi.fn();
    const history = vi.fn();
    render({
      properties: { onClick: properties, isPressed: true },
      history: { onClick: history },
    });
    const propertiesButton = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Properties"]',
    )!;
    const historyButton = host.querySelector<HTMLButtonElement>(
      'button[aria-label="History"]',
    )!;
    expect(propertiesButton.getAttribute("aria-pressed")).toBe("true");
    act(() => {
      propertiesButton.click();
      historyButton.click();
    });
    expect(properties).toHaveBeenCalledOnce();
    expect(history).toHaveBeenCalledOnce();
    expect(host.querySelector('button[aria-label="More actions"]')).toBeNull();
  });

  it("respects disabled direct actions", () => {
    const properties = vi.fn();
    render({ properties: { onClick: properties, isDisabled: true } });
    act(() =>
      host
        .querySelector<HTMLButtonElement>('button[aria-label="Properties"]')!
        .click(),
    );
    expect(properties).not.toHaveBeenCalled();
  });

  it("requires 300ms hover intent and cancels a tooltip when the pointer leaves early", () => {
    render();
    const back = host.querySelector<HTMLAnchorElement>(
      'a[aria-label="Back to Writing"]',
    )!;
    act(() => back.dispatchEvent(new MouseEvent("mouseenter")));
    act(() => vi.advanceTimersByTime(299));
    expect(shows).not.toHaveBeenCalled();
    act(() => back.dispatchEvent(new MouseEvent("mouseleave")));
    act(() => vi.advanceTimersByTime(1));
    expect(shows).not.toHaveBeenCalled();
    act(() => back.dispatchEvent(new MouseEvent("mouseenter")));
    act(() => vi.advanceTimersByTime(300));
    expect(shows).toHaveBeenCalledOnce();
  });

  it("measures a wrapping header for sticky toolbar placement and restores the ancestor on disposal", () => {
    host.style.setProperty("--editor-bar-height", "52px");
    render();
    const bar = host.querySelector<HTMLElement>(".editor-bar")!;
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
      height: 104,
    } as DOMRect);
    const observer = observations.find(({ node }) => node === bar)!;
    observer.notify();
    expect(host.style.getPropertyValue("--editor-bar-height")).toBe("104px");
    act(() => root.unmount());
    mounted = false;
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(host.style.getPropertyValue("--editor-bar-height")).toBe("52px");
  });

  it.each([false, true])(
    "retains secondary overflow on compact=%s",
    (isCompact) => {
      compact = isCompact;
      render({ menu: [{ items: [{ label: "Download", onClick: vi.fn() }] }] });
      expect(
        host
          .querySelector('button[aria-label="More actions"]')
          ?.getAttribute("aria-haspopup"),
      ).toBe(isCompact ? "dialog" : "menu");
    },
  );
});
