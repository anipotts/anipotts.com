// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { it, expect, vi } from "vitest";
import { ArticleImageCrop } from "./ArticleImageCrop";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("locks duplicate encoding and ignores the encoded result after unmount", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const close = vi.fn();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 2400, height: 1000, close })),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      return this.classList.contains("article-image-preview")
        ? ({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
        : null;
    },
  );
  let finish!: BlobCallback;
  const encode = vi
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation((callback) => {
      finish = callback;
    });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const apply = vi.fn();
  await act(async () =>
    root.render(
      <ArticleImageCrop
        file={new File(["photo"], "photo.png")}
        busy={false}
        onApply={apply}
        onCancel={() => {}}
      />,
    ),
  );
  const button = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Apply crop"),
  )!;
  act(() => {
    button.click();
    button.click();
  });
  expect(encode).toHaveBeenCalledTimes(1);
  expect(button.disabled).toBe(true);
  act(() => root.unmount());
  await act(async () => {
    finish(new Blob(["crop"], { type: "image/png" }));
  });
  expect(apply).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(1);
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
