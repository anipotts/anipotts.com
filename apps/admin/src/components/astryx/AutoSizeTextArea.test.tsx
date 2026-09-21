// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { AutoSizeTextArea } from "./AutoSizeTextArea";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;
let height: number;
let width: number;
let heightsWhenMeasured: string[];
let observers: Array<{
  notify: () => void;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}>;
beforeEach(() => {
  height = 36;
  width = 600;
  heightsWhenMeasured = [];
  observers = [];
  vi.spyOn(
    HTMLTextAreaElement.prototype,
    "scrollHeight",
    "get",
  ).mockImplementation(function (this: HTMLTextAreaElement) {
    heightsWhenMeasured.push(this.style.height);
    return height;
  });
  vi.spyOn(
    HTMLTextAreaElement.prototype,
    "clientWidth",
    "get",
  ).mockImplementation(() => width);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      notify: () => void;
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(callback: () => void) {
        this.notify = callback;
        observers.push(this);
      }
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function render(value: string) {
  act(() =>
    root.render(
      <AutoSizeTextArea
        label="Opening note"
        value={value}
        onChange={() => {}}
      />,
    ),
  );
  return host.querySelector("textarea")!;
}
it("grows and shrinks with controlled text, measuring after clearing the old height", () => {
  const field = render("");
  expect(field.rows).toBe(1);
  expect(field.style.height).toBe("36px");
  height = 108;
  render("Longer text that wraps onto several lines");
  expect(field.style.height).toBe("108px");
  height = 36;
  render("Short");
  expect(field.style.height).toBe("36px");
  expect(heightsWhenMeasured).toEqual(["auto", "auto", "auto"]);
  expect(observers[0].disconnect).toHaveBeenCalledOnce();
  expect(observers[1].disconnect).toHaveBeenCalledOnce();
});
it("refits when width changes while avoiding height-only observer loops", () => {
  const field = render("Some text");
  const observer = observers.at(-1)!;
  expect(observer.observe).toHaveBeenCalledWith(field);
  height = 72;
  observer.notify();
  expect(field.style.height).toBe("36px");
  width = 300;
  observer.notify();
  expect(field.style.height).toBe("72px");
  width = 600;
  height = 36;
  observer.notify();
  expect(field.style.height).toBe("36px");
  expect(heightsWhenMeasured).toHaveLength(3);
});
it("disconnects resize observation when removed", () => {
  render("Private text");
  const observer = observers.at(-1)!;
  act(() => root.render(null));
  expect(observer.disconnect).toHaveBeenCalledOnce();
});
