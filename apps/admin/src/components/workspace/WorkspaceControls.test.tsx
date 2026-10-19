// @vitest-environment jsdom
import React, { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminUIProvider } from "./AdminUI";
import * as controls from "./WorkspaceControls";
import * as compatibility from "../astryx/WritingControls";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("keeps existing editor imports on the same kit control implementations", () => {
  for (const name of Object.keys(compatibility) as Array<
    keyof typeof compatibility
  >)
    expect(compatibility[name]).toBe(controls[name]);
});
it.each([false, true])(
  "preserves the native file picker, ref and FileList (workspace pilot=%s)",
  (enabled) => {
    const ref = createRef<HTMLInputElement>();
    const onChange = vi.fn();
    const render = (disabled: boolean) =>
      act(() =>
        root.render(
          <AdminUIProvider enabled={enabled} mode="light">
            <controls.FileInput
              label="Supplied file"
              ref={ref}
              accept="application/json,.json"
              disabled={disabled}
              onChange={(event) => onChange(event.currentTarget.files)}
            />
          </AdminUIProvider>,
        ),
      );
    render(true);
    const input = ref.current!;
    expect(input.type).toBe("file");
    expect(input.accept).toBe("application/json,.json");
    expect(input.disabled).toBe(true);
    expect(input.labels?.[0]?.textContent).toBe("Supplied file");
    expect(Boolean(host.querySelector(".writing-control-field"))).toBe(enabled);
    render(false);
    expect(ref.current).toBe(input);
    expect(input.disabled).toBe(false);
    const supplied = new File(["synthetic"], "supplied.json", {
      type: "application/json",
    });
    const files = [supplied];
    Object.defineProperty(input, "files", { configurable: true, value: files });
    act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(files);
    input.value = "";
    expect(ref.current?.value).toBe("");
  },
);
