// @vitest-environment jsdom
import React, { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentTitle } from "./DocumentTitle";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("document title editing", () => {
  let host: HTMLDivElement;
  let root: Root;
  const flushRef = createRef<(() => void) | null>();
  const onCommit = vi.fn();
  const onDirty = vi.fn();
  const onDraftTitle = vi.fn();
  function render(value = "Original title", resetGeneration = 0) {
    act(() =>
      root.render(
        <DocumentTitle
          value={value}
          resetGeneration={resetGeneration}
          flushRef={flushRef}
          onCommit={onCommit}
          onDirty={onDirty}
          onDraftTitle={onDraftTitle}
        />,
      ),
    );
  }
  function type(value: string) {
    const input = host.querySelector("textarea")!;
    act(() => {
      input.focus();
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return input;
  }
  beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  it("shows typing and deletion immediately, then commits only the latest value", () => {
    render();
    const input = type("Original titlex");
    expect(input.value).toBe("Original titlex");
    expect(document.activeElement).toBe(input);
    expect(onDraftTitle).toHaveBeenLastCalledWith("Original titlex");
    expect(onCommit).not.toHaveBeenCalled();
    type("Original titl");
    act(() => flushRef.current?.());
    expect(onCommit).toHaveBeenCalledExactlyOnceWith("Original titl");
  });
  it("discards pending typing when explicitly restoring the same serialized title", () => {
    render();
    type("Unwanted local text");
    render("Original title", 1);
    expect(host.querySelector("textarea")!.value).toBe("Original title");
    act(() => flushRef.current?.());
    expect(onCommit).not.toHaveBeenCalled();
  });
  it("keeps pending text through an ordinary unchanged server render", () => {
    render();
    type("New local title");
    render();
    expect(host.querySelector("textarea")!.value).toBe("New local title");
    act(() => flushRef.current?.());
    expect(onCommit).toHaveBeenCalledExactlyOnceWith("New local title");
  });
});
