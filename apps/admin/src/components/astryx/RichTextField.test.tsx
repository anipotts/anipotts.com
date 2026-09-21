// @vitest-environment jsdom
import React, { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Editor } from "@tiptap/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RichTextField } from "./RichTextField";
import { inlineMarkdown } from "../../lib/rich-text";

let editor: Editor | null;
const editors = new Set<Editor>();
let renders = 0;
vi.mock("@tiptap/react", async (original) => {
  const actual = await original<typeof import("@tiptap/react")>();
  return {
    ...actual,
    useEditor: (...args: Parameters<typeof actual.useEditor>) => {
      renders++;
      editor = actual.useEditor(...args);
      if (editor) editors.add(editor);
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
  editors.clear();
  vi.stubGlobal("React", React);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
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
it("keeps its validation reference through later renders and never references nothing", async () => {
  const box = () => host.querySelector('[contenteditable][role="textbox"]')!;
  const field = (value: string, validationError?: string) =>
    act(async () =>
      root.render(
        <RichTextField
          label="Subtitle"
          value={value}
          validationError={validationError}
          onChange={changed}
        />,
      ),
    );
  await field("Original");
  expect(box().hasAttribute("aria-describedby")).toBe(false);
  await field("Original", "This field is required.");
  const error = box().getAttribute("aria-describedby");
  expect(error).toMatch(/-error$/u);
  expect(document.getElementById(error!)).not.toBeNull();
  await field("Updated", "This field is required.");
  expect(box().getAttribute("aria-describedby")).toBe(error);
  expect(box().getAttribute("aria-invalid")).toBe("true");
  await field("Updated");
  await field("Updated again");
  expect(box().hasAttribute("aria-describedby")).toBe(false);
  expect(box().getAttribute("aria-invalid")).toBe("false");
});

it("keeps the compact toolbar mounted before, during and after a text selection", async () => {
  await render();
  const toolbar = () =>
    host.querySelector('[role="toolbar"][aria-label="Subtitle formatting"]');
  const original = toolbar();
  expect(original).not.toBeNull();
  const buttons = original!.querySelectorAll("button").length;
  act(() => editor!.commands.setTextSelection({ from: 1, to: 5 }));
  expect(toolbar()).toBe(original);
  expect(toolbar()!.querySelectorAll("button").length).toBe(buttons);
  act(() => editor!.commands.setTextSelection(5));
  expect(toolbar()).toBe(original);
  expect(toolbar()!.querySelectorAll("button").length).toBe(buttons);
  expect(changed).not.toHaveBeenCalled();
});

it("formats the saved selection when a keyboard user focuses the toolbar, then supports undo and redo", async () => {
  await render();
  act(() => editor!.commands.setTextSelection({ from: 1, to: 5 }));
  const control = (label: string) =>
    host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  act(() => control("Bold").focus());
  expect(document.activeElement).toBe(control("Bold"));
  // Native Enter activation produces a click with no pointer event.
  act(() => control("Bold").click());
  expect(editor!.isActive("bold")).toBe(true);
  expect(editor!.state.selection.from).toBe(1);
  expect(editor!.state.selection.to).toBe(5);
  act(() => flushRef.current?.());
  expect(changed).toHaveBeenLastCalledWith("**Orig**inal");
  act(() => control("Undo").click());
  act(() => flushRef.current?.());
  expect(changed).toHaveBeenLastCalledWith("Original");
  act(() => control("Redo").click());
  act(() => flushRef.current?.());
  expect(changed).toHaveBeenLastCalledWith("**Orig**inal");
});

it("keeps formatting and buffered changes in the correct field when two fields are mounted", async () => {
  const secondChange = vi.fn();
  const secondFlush = createRef<(() => void) | null>();
  await act(async () =>
    root.render(
      <>
        <RichTextField
          label="Subtitle"
          value="First"
          onChange={changed}
          onDirty={dirty}
          flushRef={flushRef}
          compact
        />
        <RichTextField
          label="Card copy"
          value="Second"
          onChange={secondChange}
          onDirty={dirty}
          flushRef={secondFlush}
          compact
        />
      </>,
    ),
  );
  const first = [...editors].find((item) => item.getText() === "First")!;
  const second = [...editors].find((item) => item.getText() === "Second")!;
  act(() => first.commands.selectAll());
  const toolbar = host.querySelector(
    '[role="toolbar"][aria-label="Subtitle formatting"]',
  )!;
  act(() =>
    toolbar
      .querySelector<HTMLButtonElement>('button[aria-label="Bold"]')!
      .click(),
  );
  act(() => {
    flushRef.current?.();
    secondFlush.current?.();
  });
  expect(changed).toHaveBeenLastCalledWith("**First**");
  expect(second.getText()).toBe("Second");
  expect(secondChange).not.toHaveBeenCalled();
});

it("does not open a link panel from an IME composition key event", async () => {
  await render();
  const key = new KeyboardEvent("keydown", {
    key: "k",
    ctrlKey: true,
    isComposing: true,
    bubbles: true,
    cancelable: true,
  });
  expect(editor!.options.editorProps.handleKeyDown?.(editor!.view, key)).toBe(
    false,
  );
  expect(key.defaultPrevented).toBe(false);
  expect(host.textContent).not.toContain("Apply link");
});

it("preserves the link shortcut after validation updates replace field attributes", async () => {
  await render();
  await act(async () =>
    root.render(
      <RichTextField
        label="Subtitle"
        value="Original"
        onChange={changed}
        validationError="Needs review"
        compact
      />,
    ),
  );
  vi.spyOn(editor!.view, "coordsAtPos").mockReturnValue({
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  });
  const key = new KeyboardEvent("keydown", {
    key: "k",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => {
    expect(editor!.options.editorProps.handleKeyDown?.(editor!.view, key)).toBe(
      true,
    );
  });
  expect(key.defaultPrevented).toBe(true);
  expect(document.body.textContent).toContain("Apply link");
  expect(changed).not.toHaveBeenCalled();
});
