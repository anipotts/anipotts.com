// @vitest-environment jsdom
import React, { act } from "react";
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
// Exercise the real editor and panel; only replace the remote upload boundary.
vi.mock("./ArticleImageUpload", () => ({
  ArticleImageUpload: () => <span>Upload failed</span>,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
function click(label: string) {
  const button = Array.from(host.querySelectorAll("button")).find(
    (node) => node.textContent?.trim() === label,
  );
  expect(button, label).toBeTruthy();
  act(() => button!.click());
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    })),
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
it.each(["paste", "drop"])(
  "failed %s cannot reuse an earlier image URL or alt text",
  async (kind) => {
    await act(async () =>
      root.render(
        <ArticleBody
          value={"![Previous alt](https://example.com/a.png)\n\nText"}
          onChange={() => {}}
        />,
      ),
    );
    await act(async () => {
      editor!.state.doc.descendants((node, pos) => {
        if (node.type.name === "image") editor!.commands.setNodeSelection(pos);
      });
    });
    click("Format and insert");
    click("Image");
    expect(
      Array.from(host.querySelectorAll<HTMLInputElement>("input")).map(
        (input) => input.value,
      ),
    ).toContain("https://example.com/a.png");
    click("Cancel");
    act(() =>
      editor!.commands.setTextSelection(editor!.state.doc.content.size - 1),
    );
    const event = new Event(kind, { bubbles: true, cancelable: true });
    const file = new File(["B"], "b.png", { type: "image/png" });
    Object.defineProperty(
      event,
      kind === "paste" ? "clipboardData" : "dataTransfer",
      { value: { files: [file] } },
    );
    if (kind === "drop")
      vi.spyOn(editor!.view, "posAtCoords").mockReturnValue(null);
    act(() => {
      if (kind === "paste")
        editor!.options.editorProps.handlePaste?.(
          editor!.view,
          event as ClipboardEvent,
          null!,
        );
      else
        editor!.options.editorProps.handleDrop?.(
          editor!.view,
          event as DragEvent,
          null!,
          false,
        );
    });
    expect(host.textContent).toContain("Upload failed");
    const inputs = Array.from(host.querySelectorAll<HTMLInputElement>("input"));
    expect(inputs.map((input) => input.value)).not.toContain(
      "https://example.com/a.png",
    );
    expect(inputs.map((input) => input.value)).not.toContain("Previous alt");
    click("Insert image");
    expect(host.textContent).toContain(
      "Enter a valid HTTPS address or site path.",
    );
    let images = 0;
    editor!.state.doc.descendants((node) => {
      if (node.type.name === "image") images++;
    });
    expect(images).toBe(1);
  },
);
