// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ArticleImageUpload, uploadEditorialImage } from "./ArticleImageUpload";

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
      expect(fetcher.mock.calls[1]?.[1].signal.aborted).toBe(true);
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

it("canceling while decoding prevents any network request", async () => {
  let finish!: (bitmap: ImageBitmap) => void;
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(
      () =>
        new Promise<ImageBitmap>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const uploaded = vi.fn();
  await act(async () =>
    root.render(
      <ArticleImageUpload
        initialFile={new File(["x"], "test.png")}
        onUploaded={uploaded}
        onPendingChange={() => {}}
      />,
    ),
  );
  act(() => root.unmount());
  mounted = false;
  const close = vi.fn();
  await act(async () => finish({ close } as unknown as ImageBitmap));
  expect(close).toHaveBeenCalledOnce();
  expect(fetcher).not.toHaveBeenCalled();
  expect(uploaded).not.toHaveBeenCalled();
});

it("canceling during session preparation never starts media upload", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  const result = uploadEditorialImage(new Blob(["x"]), controller.signal);
  const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  finish(new Response(JSON.stringify({ csrf: "test-only" })));
  await rejected;
  expect(fetcher).toHaveBeenCalledOnce();
});

it("canceling while reading aborts FileReader before media upload", async () => {
  const abort = vi.spyOn(FileReader.prototype, "abort");
  const read = vi
    .spyOn(FileReader.prototype, "readAsDataURL")
    .mockImplementation(() => {});
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ csrf: "test-only" })));
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  const result = uploadEditorialImage(new Blob(["x"]), controller.signal);
  const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
  controller.abort();
  await rejected;
  expect(abort).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledOnce();
});
