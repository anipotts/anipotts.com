// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Editor } from "@tiptap/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ArticleBody } from "./ArticleBody";
import {
  editorialImagePreview,
  editorialMediaPrefix,
} from "../../lib/editorial-media";
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
const imageA = `${editorialMediaPrefix}${"a".repeat(64)}.png`;
const imageB = `${editorialMediaPrefix}${"b".repeat(64)}.png`;
const cropped = `${"c".repeat(64)}.png`;
let host: HTMLDivElement;
let root: Root;
function button(label: string) {
  const node = Array.from(host.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  expect(node, label).toBeTruthy();
  return node!;
}
/** Let fetch, decode and FileReader work resolve inside act until the expectation holds. */
async function settle(expectation: () => void) {
  for (let attempt = 0; ; attempt++) {
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    try {
      expectation();
      return;
    } catch (error) {
      if (attempt >= 500) throw error;
    }
  }
}
function imageSources() {
  const sources: Record<string, string> = {};
  editor!.state.doc.descendants((node) => {
    if (node.type.name === "image")
      sources[String(node.attrs.alt)] = String(node.attrs.src);
  });
  return sources;
}
function selectImage(alt: string) {
  editor!.state.doc.descendants((node, pos) => {
    if (node.type.name === "image" && node.attrs.alt === alt)
      editor!.commands.setNodeSelection(pos);
  });
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
  vi.restoreAllMocks();
});
/** Stub the media boundary; distinct byte lengths identify each original. */
function stubCropTransport() {
  const originals: Record<string, number> = {
    [editorialImagePreview(imageA)]: 1,
    [editorialImagePreview(imageB)]: 2,
  };
  const fetcher = vi.fn(async (input: string) => {
    if (input in originals)
      return {
        ok: true,
        blob: async () =>
          new Blob([new Uint8Array(originals[input]!)], { type: "image/png" }),
      };
    if (input === "/api/editorial/csrf")
      return { ok: true, json: async () => ({ csrf: "test-only" }) };
    if (input === "/api/editorial/media")
      return {
        ok: true,
        json: async () => ({ ok: true, media: { id: cropped } }),
      };
    throw new Error(`unexpected request ${input}`);
  });
  vi.stubGlobal("fetch", fetcher);
  const decode = vi.fn(async (_file: Blob) => ({
    width: 1600,
    height: 900,
    close() {},
  }));
  vi.stubGlobal("createImageBitmap", decode);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      return this.classList.contains("article-image-preview")
        ? ({ drawImage() {} } as unknown as CanvasRenderingContext2D)
        : null;
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback) => callback(new Blob(["crop"], { type: "image/png" })),
  );
  return { fetcher, decode };
}
async function openCropOnImageA() {
  await act(async () =>
    root.render(
      <ArticleBody
        value={`![Image A](${imageA})\n\nText between images\n\n![Image B](${imageB})`}
        onChange={() => {}}
      />,
    ),
  );
  await act(async () => selectImage("Image A"));
  act(() => {
    editor!.view.dom.dispatchEvent(
      new FocusEvent("focusin", { bubbles: true }),
    );
  });
  act(() => button("Crop image").click());
  await settle(() => expect(button("Apply crop").disabled).toBe(false));
}
// Each test mounts the real editor and cropper, which is slow on a loaded runner.
it("keeps cropping the image the panel opened on after the selection moves", async () => {
  const { fetcher, decode } = stubCropTransport();
  await openCropOnImageA();
  expect(decode.mock.lastCall?.[0].size).toBe(1);

  await act(async () => {
    editor!.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === "Text between images")
        editor!.commands.setTextSelection(pos + 1);
    });
  });
  await act(async () => selectImage("Image B"));
  await settle(() => expect(button("Apply crop").disabled).toBe(false));

  expect(fetcher.mock.calls.map(([input]) => input)).not.toContain(
    editorialImagePreview(imageB),
  );
  expect(decode.mock.calls.map(([file]) => file.size)).not.toContain(2);
  act(() => button("Apply crop").click());
  await settle(() => expect(button("Update image").disabled).toBe(false));
  act(() => button("Update image").click());
  expect(imageSources()).toEqual({
    "Image A": `${editorialMediaPrefix}${cropped}`,
    "Image B": imageB,
  });
}, 20_000);

it("a removed crop target still invalidates the update", async () => {
  stubCropTransport();
  await openCropOnImageA();
  await act(async () => {
    editor!.state.doc.descendants((node, pos) => {
      if (node.type.name === "image" && node.attrs.alt === "Image A")
        editor!.commands.deleteRange({ from: pos, to: pos + node.nodeSize });
    });
  });
  await act(async () => selectImage("Image B"));
  await settle(() => expect(button("Apply crop").disabled).toBe(false));
  act(() => button("Apply crop").click());
  await settle(() => expect(button("Update image").disabled).toBe(false));
  act(() => button("Update image").click());
  expect(host.textContent).toContain("This editing target was removed");
  expect(imageSources()).toEqual({ "Image B": imageB });
}, 20_000);
