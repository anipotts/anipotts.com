// @vitest-environment jsdom
import React, { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Editor } from "@tiptap/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RichTextField } from "./RichTextField";
import { inlineMarkdown } from "../../lib/rich-text";

let editor: Editor | null;
let renders = 0;
vi.mock("@tiptap/react", async (original) => {
  const actual = await original<typeof import("@tiptap/react")>();
  return {
    ...actual,
    useEditor: (...args: Parameters<typeof actual.useEditor>) => {
      renders++;
      editor = actual.useEditor(...args);
      return editor;
    },
  };
});
vi.mock("../../lib/rich-text", async (original) => {
  const actual = await original<typeof import("../../lib/rich-text")>();
  return { ...actual, inlineMarkdown: vi.fn(actual.inlineMarkdown) };
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
const flushRef = createRef<(() => void) | null>();
const changed = vi.fn();
const dirty = vi.fn();
async function render(value = "Original", resetGeneration = 0) {
  await act(async () =>
    root.render(
      <RichTextField
        label="Subtitle"
        value={value}
        onChange={changed}
        onDirty={dirty}
        flushRef={flushRef}
        resetGeneration={resetGeneration}
        compact
      />,
    ),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    })),
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("keeps typing local, serializes once on flush, and only rerenders changed toolbar state", async () => {
  await render();
  await act(async () => {
    editor!.commands.insertContent("a");
  });
  const count = renders;
  await act(async () => {
    editor!.commands.insertContent("b");
  });
  await act(async () => {
    editor!.commands.insertContent("c");
  });
  expect(editor!.getText()).toContain("abc");
  expect(inlineMarkdown).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
  expect(renders).toBe(count);
  await render(); // unrelated parent update must preserve pending typing
  expect(editor!.getText()).toContain("abc");
  act(() => flushRef.current?.());
  expect(inlineMarkdown).toHaveBeenCalledOnce();
  expect(changed).toHaveBeenCalledOnce();
  expect(changed.mock.calls[0][0]).toContain("abc");
  act(() => flushRef.current?.());
  expect(inlineMarkdown).toHaveBeenCalledOnce();
});
it("explicit reset discards pending local serialization and installs the authoritative value", async () => {
  await render();
  act(() => {
    editor!.commands.insertContent("unsaved");
  });
  await render("Original", 1);
  expect(editor!.getText()).toBe("Original");
  act(() => flushRef.current?.());
  expect(changed).not.toHaveBeenCalled();
});
it("updates selected formatting and undo controls without serializing selection changes", async () => {
  await render();
  await act(async () => {
    editor!.commands.selectAll();
  });
  expect(inlineMarkdown).not.toHaveBeenCalled();
  await act(async () => {
    editor!.commands.toggleBold();
  });
  const bold = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Bold"]',
  );
  expect(bold?.getAttribute("aria-pressed")).toBe("true");
  expect(inlineMarkdown).not.toHaveBeenCalled();
  await act(async () => {
    editor!.commands.undo();
  });
  expect(bold?.getAttribute("aria-pressed")).toBe("false");
  act(() => flushRef.current?.());
  expect(changed).toHaveBeenCalledExactlyOnceWith("Original");
});
it("preserves immediate onChange for callers without a buffered save controller", async () => {
  await act(async () =>
    root.render(
      <RichTextField label="Summary" value="Original" onChange={changed} />,
    ),
  );
  act(() => {
    editor!.commands.insertContent("a");
  });
  expect(changed).toHaveBeenCalledOnce();
  expect(changed.mock.calls[0][0]).toContain("a");
});
