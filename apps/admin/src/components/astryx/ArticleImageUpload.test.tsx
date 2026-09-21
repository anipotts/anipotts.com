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

it("an aborted original image load releases the crop controls", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 1600, height: 900, close() {} }),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      return this.classList.contains("article-image-preview")
        ? ({ drawImage() {} } as unknown as CanvasRenderingContext2D)
        : null;
    },
  );
  const imageA = `/images/editorial/${"a".repeat(64)}.png`;
  const imageB = `/images/editorial/${"b".repeat(64)}.png`;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob([new Uint8Array([1])], { type: "image/png" }),
    })
    .mockImplementationOnce(
      (_input: string, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal!.addEventListener("abort", () =>
            reject(init.signal!.reason),
          ),
        ),
    );
  vi.stubGlobal("fetch", fetcher);
  const pending = vi.fn();
  const render = (existingSrc?: string) =>
    act(async () =>
      root.render(
        <ArticleImageUpload
          existingSrc={existingSrc}
          startCropping
          onUploaded={() => {}}
          onPendingChange={pending}
        />,
      ),
    );
  const control = (label: string) =>
    [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes(label),
    )!;
  await render(imageA);
  await act(async () => {});
  expect(control("Apply crop").disabled).toBe(false);
  await render(imageB);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(control("Apply crop").disabled).toBe(true);
  expect(control("Cancel crop").disabled).toBe(true);
  await render(undefined);
  expect(fetcher.mock.calls[1]?.[1].signal.aborted).toBe(true);
  await act(async () => {});
  expect(control("Apply crop").disabled).toBe(false);
  expect(control("Cancel crop").disabled).toBe(false);
});

it("disabling during a crop upload keeps the upload busy", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 1600, height: 900, close() {} }),
  );
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
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob([new Uint8Array([1])], { type: "image/png" }),
    })
    .mockImplementationOnce(
      (_input: string, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal!.addEventListener("abort", () =>
            reject(init.signal!.reason),
          ),
        ),
    );
  vi.stubGlobal("fetch", fetcher);
  const pending = vi.fn();
  const render = (disabled: boolean) =>
    act(async () =>
      root.render(
        <ArticleImageUpload
          existingSrc={`/images/editorial/${"a".repeat(64)}.png`}
          startCropping
          disabled={disabled}
          onUploaded={() => {}}
          onPendingChange={pending}
        />,
      ),
    );
  const control = (label: string) =>
    [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes(label),
    )!;
  const uploadBusy = () =>
    [...host.querySelectorAll("button")].find((button) =>
      button.getAttribute("aria-label")?.includes("Upload image"),
    )!;
  await render(false);
  await act(async () => {});
  expect(control("Apply crop").disabled).toBe(false);
  await act(async () => control("Apply crop").click());
  await act(async () => {
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });
  expect(fetcher.mock.calls[1]?.[0]).toBe("/api/editorial/csrf");
  expect(uploadBusy().getAttribute("aria-busy")).toBe("true");
  await render(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1]?.[1].signal.aborted).toBe(false);
  expect(uploadBusy().getAttribute("aria-busy")).toBe("true");
  expect(control("Apply crop").disabled).toBe(true);
  expect(pending).toHaveBeenLastCalledWith(true);
});

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

it("does not expose transport errors while reopening an uploaded image", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("PRIVATE provider response");
    }),
  );
  await act(async () =>
    root.render(
      <ArticleImageUpload
        existingSrc={`/images/editorial/${"a".repeat(64)}.png`}
        onUploaded={() => {}}
        onPendingChange={() => {}}
      />,
    ),
  );
  expect(host.textContent).toContain("Couldn’t load this image");
  expect(host.textContent).not.toContain("PRIVATE");
});

it("releases pending state when reopening an image reaches its deadline", async () => {
  const deadline = new AbortController();
  const timeout = vi
    .spyOn(AbortSignal, "timeout")
    .mockReturnValue(deadline.signal);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => reject(options.signal.reason),
            { once: true },
          );
        }),
    ),
  );
  const pending = vi.fn();
  await act(async () =>
    root.render(
      <ArticleImageUpload
        existingSrc={`/images/editorial/${"a".repeat(64)}.png`}
        onUploaded={() => {}}
        onPendingChange={pending}
      />,
    ),
  );
  expect(timeout).toHaveBeenCalledWith(15000);
  expect(pending).toHaveBeenLastCalledWith(true);
  await act(async () =>
    deadline.abort(new DOMException("Timed out", "TimeoutError")),
  );
  expect(pending).toHaveBeenLastCalledWith(false);
  expect(host.textContent).toContain("Choose its original file to crop it");
  expect(
    host.querySelector<HTMLInputElement>('input[type="file"]')?.disabled,
  ).toBe(false);
});
