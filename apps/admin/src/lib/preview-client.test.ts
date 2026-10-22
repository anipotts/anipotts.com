// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  installOwnedPreviewMedia,
  installPreviewClient,
} from "../../../www/src/scripts/preview-client.js";
const id = "a".repeat(64) + ".png";
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("installs owned Blob URLs without forcing lazy image decoding and revokes only its URLs on disposal", async () => {
  const create = vi.fn(() => "blob:synthetic-owned");
  const revoke = vi.fn();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    },
  );
  document.body.innerHTML = `<img loading="lazy" data-preview-owned-src="${id}" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><script type="application/octet-stream" data-preview-owned-media="${id}" data-media-type="image/png">d09GMg==</script>`;
  const image = document.querySelector("img")!;
  const decode = vi.fn();
  image.decode = decode;
  await installOwnedPreviewMedia();
  expect(image.getAttribute("loading")).toBe("lazy");
  expect(image.getAttribute("src")).toBe("blob:synthetic-owned");
  expect(decode).not.toHaveBeenCalled();
  expect(create).toHaveBeenCalledTimes(1);
  expect(document.querySelector("[data-preview-owned-media]")).toBeNull();
  window.dispatchEvent(new Event("pagehide"));
  expect(revoke).toHaveBeenCalledWith("blob:synthetic-owned");
});
it("reports a later lazy owned-image failure instead of retaining a healthy preview", async () => {
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = () => "blob:synthetic-owned";
      static revokeObjectURL = () => {};
    },
  );
  const post = vi.spyOn(window.parent, "postMessage");
  document.body.innerHTML = `<img loading="lazy" data-preview-owned-src="${id}"><script type="application/octet-stream" data-preview-owned-media="${id}" data-media-type="image/png">d09GMg==</script>`;
  await installOwnedPreviewMedia();
  document.querySelector("img")!.dispatchEvent(new Event("error"));
  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "editorial-preview-status",
      status: "unavailable",
    }),
    "*",
  );
});
it("keeps preview navigation and theme controls functional without persistence or a router", () => {
  document.body.innerHTML =
    '<button id="nav-toggle" aria-expanded="false">menu</button><nav id="primary-nav"></nav><button id="theme-toggle"></button>';
  installPreviewClient();
  document.getElementById("nav-toggle")!.click();
  expect(
    document.getElementById("primary-nav")!.getAttribute("data-open"),
  ).toBe("true");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(document.getElementById("nav-toggle")).toBe(document.activeElement);
  expect(
    document.getElementById("nav-toggle")!.getAttribute("aria-expanded"),
  ).toBe("false");
  document.documentElement.dataset.theme = "light";
  document.getElementById("theme-toggle")!.click();
  expect(document.documentElement.dataset.theme).toBe("dark");
});

it("latches an owned-image error while font readiness is pending so it cannot later become ready", async () => {
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = () => "blob:synthetic-owned";
      static revokeObjectURL = () => {};
    },
  );
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const descriptor = Object.getOwnPropertyDescriptor(document, "fonts");
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready },
  });
  try {
    document.body.innerHTML = `<img loading="lazy" data-preview-owned-src="${id}"><script type="application/octet-stream" data-preview-owned-media="${id}" data-media-type="image/png">d09GMg==</script>`;
    const installed = installOwnedPreviewMedia();
    const rejection = expect(installed).rejects.toThrow(
      "Preview media decode failed",
    );
    document.querySelector("img")!.dispatchEvent(new Event("error"));
    release();
    await rejection;
  } finally {
    if (descriptor) Object.defineProperty(document, "fonts", descriptor);
    else delete (document as unknown as Record<string, unknown>).fonts;
  }
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
it.each([
  ["dark", false, "dark"],
  ["light", true, "light"],
  ["system", true, "dark"],
  ["invalid", true, "light"],
] as const)(
  "the actual Shell inline theme honors %s with opaque cookie/storage failures and OS dark=%s",
  (theme, osDark, expected) => {
    const source = readFileSync(
      resolve(process.cwd(), "../www/src/layouts/Shell.astro"),
      "utf8",
    );
    const script = /<script is:inline>([\s\S]*?)<\/script>/.exec(source)![1];
    const root = { dataset: {} as Record<string, string> };
    const doc = {
      documentElement: root,
      get cookie(): string {
        throw new DOMException("Opaque origin", "SecurityError");
      },
    };
    runInNewContext(script, {
      URL,
      location: {
        href: `https://admin.anipotts.com/preview/record?theme=${theme}`,
      },
      document: doc,
      localStorage: {
        getItem() {
          throw new DOMException("Opaque origin", "SecurityError");
        },
      },
      matchMedia: () => ({ matches: osDark }),
      window: { __apThemeSync: () => {} },
    });
    expect(root.dataset.theme).toBe(expected);
  },
);
