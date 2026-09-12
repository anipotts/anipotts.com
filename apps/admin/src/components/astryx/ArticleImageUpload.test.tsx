// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ArticleImageUpload } from "./ArticleImageUpload";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
let mounted: boolean;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mounted = true;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({
      matches: false,
      media,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return true;
      },
    })),
  );
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ close() {} }));
});
afterEach(() => {
  if (mounted) act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it.each([false, true])(
  "upload completion after unmount=%s cannot alter a closed inspector",
  async (unmount) => {
    let finish!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrf: "test-only" })),
      )
      .mockReturnValueOnce(response);
    vi.stubGlobal("fetch", fetcher);
    const uploaded = vi.fn();
    const pending = vi.fn();
    const file = new File([new Uint8Array([1])], "test.png", {
      type: "image/png",
    });
    await act(async () => {
      root.render(
        <ArticleImageUpload
          initialFile={file}
          onUploaded={uploaded}
          onPendingChange={pending}
        />,
      );
    });
    await act(async () => {
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    });
    if (unmount) {
      act(() => root.unmount());
      mounted = false;
    }
    await act(async () => {
      finish(
        new Response(
          JSON.stringify({ ok: true, media: { id: `${"a".repeat(64)}.png` } }),
        ),
      );
      await response;
    });
    if (unmount) expect(uploaded).not.toHaveBeenCalled();
    else
      expect(uploaded).toHaveBeenCalledExactlyOnceWith(
        `/images/editorial/${"a".repeat(64)}.png`,
      );
  },
);
