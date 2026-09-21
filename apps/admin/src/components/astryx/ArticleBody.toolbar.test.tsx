// @vitest-environment jsdom
import React, { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Editor } from "@tiptap/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ArticleBody } from "./ArticleBody";

let editor: Editor | null;
vi.mock("@tiptap/react", async (original) => {
  const actual = await original<typeof import("@tiptap/react")>();
  return {
    ...actual,
    useEditor: (...args: Parameters<typeof actual.useEditor>) => {
      editor = actual.useEditor(...args);
      return editor;
    },
  };
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
const changed = vi.fn();
const dirty = vi.fn();
const flushRef = createRef<(() => void) | null>();

async function render(
  value = "Original article",
  resetGeneration = 0,
  disabled = false,
) {
  await act(async () =>
    root.render(
      <ArticleBody
        value={value}
        onChange={changed}
        onDirty={dirty}
        flushRef={flushRef}
        resetGeneration={resetGeneration}
        disabled={disabled}
      />,
    ),
  );
}
function control(label: string): HTMLButtonElement {
  const button = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button, [role=menuitem]"),
  ).find(
    (item) =>
      item.getAttribute("aria-label") === label ||
      item.textContent?.trim() === label,
  );
  expect(button, label).toBeTruthy();
  return button!;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    })),
  );
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
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("always exposes the same toolbar across cursor and selection changes without a second floating toolbar", async () => {
  await render();
  const toolbar = host.querySelector(
    '[role="toolbar"][aria-label="Article formatting"]',
  );
  expect(toolbar).not.toBeNull();
  expect(host.textContent).not.toContain("Format and insert");
  const controls = Array.from(toolbar!.querySelectorAll("button"));
  act(() => editor!.commands.setTextSelection({ from: 1, to: 9 }));
  expect(
    host.querySelector('[role="toolbar"][aria-label="Article formatting"]'),
  ).toBe(toolbar);
  expect(Array.from(toolbar!.querySelectorAll("button"))).toEqual(controls);
  expect(
    host.querySelector('[aria-label="Selected text formatting"]'),
  ).toBeNull();
  act(() => editor!.commands.setTextSelection(9));
  expect(Array.from(toolbar!.querySelectorAll("button"))).toEqual(controls);
  expect(changed).not.toHaveBeenCalled();
});

it("applies formatting from keyboard-focused controls to the original selection and keeps undo local until flush", async () => {
  await render();
  act(() => editor!.commands.setTextSelection({ from: 1, to: 9 }));
  act(() => control("Bold").focus());
  expect(document.activeElement).toBe(control("Bold"));
  act(() => control("Bold").click());
  expect(editor!.state.selection.from).toBe(1);
  expect(editor!.state.selection.to).toBe(9);
  expect(editor!.isActive("bold")).toBe(true);
  expect(changed).not.toHaveBeenCalled();
  act(() => flushRef.current?.());
  expect(changed).toHaveBeenLastCalledWith("**Original** article");
  act(() => control("Undo").click());
  act(() => flushRef.current?.());
  expect(changed).toHaveBeenLastCalledWith("Original article");
  act(() => control("Redo").click());
  act(() => flushRef.current?.());
  expect(changed).toHaveBeenLastCalledWith("**Original** article");
});

it("exposes paragraph, heading and insertion effects through the stable menus", async () => {
  await render();
  act(() => control("Style").click());
  act(() => control("Heading").click());
  expect(editor!.isActive("heading", { level: 2 })).toBe(true);
  act(() => control("Style").click());
  act(() => control("Paragraph").click());
  expect(editor!.isActive("paragraph")).toBe(true);
  act(() => control("Insert").click());
  act(() => control("Bullet list").click());
  expect(editor!.isActive("bulletList")).toBe(true);
});

it("preserves pending typing through parent renders and discards it only for an explicit authoritative reset", async () => {
  await render();
  act(() => editor!.commands.insertContent("Pending "));
  await render();
  expect(editor!.getText()).toContain("Pending ");
  expect(changed).not.toHaveBeenCalled();
  await render("Restored article", 1);
  expect(editor!.getText()).toBe("Restored article");
  act(() => flushRef.current?.());
  expect(changed).not.toHaveBeenCalled();
});

it("does not intercept IME composition as a formatting shortcut", async () => {
  await render();
  for (const key of ["k", "/"]) {
    const event = new KeyboardEvent("keydown", {
      key,
      ctrlKey: key === "k",
      isComposing: true,
      bubbles: true,
      cancelable: true,
    });
    expect(
      editor!.options.editorProps.handleKeyDown?.(editor!.view, event),
    ).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  }
  expect(host.textContent).not.toContain("Apply link");
});

it("disables formatting with the editor while retaining its stable layout", async () => {
  await render("Original article", 0, true);
  const buttons = Array.from(
    host.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'),
  );
  expect(buttons.length).toBeGreaterThan(0);
  expect(
    buttons.every(
      (button) =>
        button.disabled || button.getAttribute("aria-disabled") === "true",
    ),
  ).toBe(true);
  act(() => control("Bold").click());
  expect(editor!.isActive("bold")).toBe(false);
  expect(changed).not.toHaveBeenCalled();
  expect(editor!.isEditable).toBe(false);
});

it("preserves advanced Markdown through the source fallback", async () => {
  const source =
    "<details><summary>Details</summary>Keep this exact HTML.</details>";
  await render(source);
  expect(host.querySelector('[aria-label="Article formatting"]')).toBeNull();
  expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
    source,
  );
  expect(changed).not.toHaveBeenCalled();
});
