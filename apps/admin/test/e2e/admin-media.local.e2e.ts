import { unlockSyntheticBrowserRecovery } from "../support/browser-recovery-key";
import { randomUUID } from "node:crypto";
import { test, type Browser } from "@e2e-dev/web";
import { expect, type TestFixtures } from "e2e";

type MediaFixtures = Pick<TestFixtures, "app" | "screen"> & {
  browser: Browser;
};
const mediaRoute = /\/api\/editorial\/media(?:\?|$)/;

// Run through e2e.admin.config.ts only. Its server owns a disposable D1/DO
// directory. These tests create synthetic private drafts and media there;
// they never publish, use an existing article, or call a production origin.
async function newArticle({ app, browser, screen }: MediaFixtures) {
  await app.open("/content/new");
  await unlockSyntheticBrowserRecovery(browser);
  const local = await browser.evaluate(
    () =>
      ["127.0.0.1", "localhost"].includes(location.hostname) &&
      location.protocol === "http:" &&
      Boolean(location.port),
  );
  expect(local).toBe(true);
  const title = screen.getByRole("textbox", { name: "Title", exact: true });
  await expect(title).toBeVisible({ timeout: 20_000 });
  await title.fill(`Synthetic media acceptance ${randomUUID()}`);
  await screen
    .getByRole("button", { name: "Create draft", exact: true })
    .click();
  await expect(
    screen.getByRole("textbox", { name: "Article body", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await screen
    .getByRole("textbox", { name: "Subtitle", exact: true })
    .fill("Synthetic image acceptance only.");
}

async function openImage({ screen }: MediaFixtures) {
  await screen
    .getByRole("textbox", { name: "Article body", exact: true })
    .click();
  await screen.getByRole("button", { name: "Insert", exact: true }).click();
  await screen.getByRole("menuitem", { name: "Image", exact: true }).click();
  await expect(
    screen.getByRole("textbox", { name: "Image URL", exact: true }),
  ).toBeVisible();
}

/** The installed runner accepts file paths, not buffers, in setInputFiles.
 * Create real PNG bytes with the browser's encoder and supply a native FileList
 * to the actual upload input. No createImageBitmap/canvas/upload mocks. */
async function selectSyntheticImage(browser: Browser, replacement = false) {
  return browser.evaluate(async (alternate) => {
    const input = document.querySelector<HTMLInputElement>(
      'input[type="file"][accept*="image/png"]',
    );
    if (!input || input.disabled)
      throw new Error("The image upload control is not ready");
    const canvas = document.createElement("canvas");
    canvas.width = 2400;
    canvas.height = 1600;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    const colors = alternate
      ? ["#7c36d5", "#19d0cf", "#f77817", "#d71f8b"]
      : ["#d52626", "#169e4e", "#265ed5", "#f0c52e"];
    for (let index = 0; index < colors.length; index++) {
      context.fillStyle = colors[index]!;
      context.fillRect(
        (index % 2) * 1200,
        Math.floor(index / 2) * 800,
        1200,
        800,
      );
    }
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("PNG encoding failed")),
        "image/png",
      ),
    );
    const hash = [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
      ),
    ]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([blob], alternate ? "replacement.png" : "synthetic.png", {
        type: "image/png",
      }),
    );
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return {
      id: `${hash}.png`,
      size: blob.size,
      width: canvas.width,
      height: canvas.height,
    };
  }, replacement);
}

async function canvasEvidence(browser: Browser) {
  return browser.evaluate(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      'canvas[aria-label="Selected image crop preview"]',
    );
    const context = canvas?.getContext("2d");
    if (!canvas || !context) throw new Error("Crop preview is not ready");
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("PNG encoding failed")),
        "image/png",
      ),
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    const pixelHash = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", pixels)),
    ]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    return {
      id: `${hash}.png`,
      size: bytes.length,
      pixelHash,
      width: canvas.width,
      height: canvas.height,
      corner: Array.from(pixels.slice(0, 4)),
    };
  });
}

async function storedImage(browser: Browser, id: string) {
  return browser.evaluate(async (mediaId) => {
    if (!["localhost", "127.0.0.1"].includes(location.hostname))
      throw new Error("Local media only");
    if (!/^[a-f0-9]{64}\.png$/.test(mediaId))
      throw new Error("Invalid synthetic media identity");
    const response = await fetch(`/api/editorial/media?id=${mediaId}`, {
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`Stored media returned ${response.status}`);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    // A valid PNG signature/IHDR plus a successful browser decode distinguishes
    // retrievable image bytes from the container-only server admission check.
    const signature = Array.from(bytes.slice(0, 8));
    const view = new DataView(bytes.buffer);
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const pixelHash = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", pixels)),
    ]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    return {
      id: `${hash}.png`,
      size: bytes.length,
      type: response.headers.get("content-type"),
      declaredLength: response.headers.get("content-length"),
      signature,
      ihdr: String.fromCharCode(...bytes.slice(12, 16)),
      headerWidth: view.getUint32(16),
      headerHeight: view.getUint32(20),
      width: canvas.width,
      height: canvas.height,
      pixelHash,
      corner: Array.from(pixels.slice(0, 4)),
    };
  }, id);
}

async function expectCanvasSize(
  browser: Browser,
  width: number,
  height: number,
) {
  await expect
    .poll(() =>
      browser.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>(
          'canvas[aria-label="Selected image crop preview"]',
        );
        return canvas ? [canvas.width, canvas.height] : null;
      }),
    )
    .toEqual([width, height]);
}

async function chooseShape(
  { screen, browser }: MediaFixtures,
  name: string,
  width: number,
  height: number,
) {
  await screen.getByRole("button", { name: "Crop shape", exact: true }).click();
  await screen.getByRole("menuitemradio", { name, exact: true }).click();
  await expectCanvasSize(browser, width, height);
}

test(
  "real crop output is stored losslessly while its original remains retrievable",
  { timeout: 120_000 },
  async (fixtures) => {
    const { app, browser, screen } = fixtures;
    await newArticle(fixtures);
    let uploads = 0;
    await browser.route(mediaRoute, async (route) => {
      if (route.request.method === "POST") uploads++;
      await route.continue();
    });
    await openImage(fixtures);
    const original = await selectSyntheticImage(browser);
    const url = screen.getByRole("textbox", { name: "Image URL", exact: true });
    await expect(url).toHaveValue(`/images/editorial/${original.id}`, {
      timeout: 20_000,
    });
    await screen
      .getByRole("button", { name: "Crop image", exact: true })
      .click();
    await expect(
      screen.getByRole("button", { name: "Apply crop", exact: true }),
    ).toBeEnabled();
    await expectCanvasSize(browser, 1886, 1061);
    await chooseShape(fixtures, "Square (1:1)", 1414, 1414);
    await screen
      .getByRole("button", { name: "Cancel crop", exact: true })
      .click();
    await expect(url).toHaveValue(`/images/editorial/${original.id}`);
    expect(uploads).toBe(1);

    await screen
      .getByRole("button", { name: "Crop image", exact: true })
      .click();
    await expect(
      screen.getByRole("button", { name: "Apply crop", exact: true }),
    ).toBeEnabled();
    await expectCanvasSize(browser, 1886, 1061);
    await chooseShape(fixtures, "Panorama (2.4:1)", 2191, 913);
    await chooseShape(fixtures, "Landscape (3:2)", 1732, 1155);
    await chooseShape(fixtures, "Square (1:1)", 1414, 1414);
    const zoom = screen.getByRole("slider", { name: "Zoom", exact: true });
    await zoom.press("Home");
    await zoom.press("PageUp");
    await zoom.press("PageUp");
    await expect(zoom).toHaveAttribute("aria-valuenow", "2");
    await expectCanvasSize(browser, 800, 800);
    const horizontal = screen.getByRole("slider", {
      name: "Horizontal position",
      exact: true,
    });
    const vertical = screen.getByRole("slider", {
      name: "Vertical position",
      exact: true,
    });
    await horizontal.press("End");
    await vertical.press("End");
    await expect
      .poll(async () => (await canvasEvidence(browser)).corner)
      .toEqual([240, 197, 46, 255]);
    await horizontal.press("Home");
    await vertical.press("Home");
    await expect
      .poll(async () => (await canvasEvidence(browser)).corner)
      .toEqual([213, 38, 38, 255]);
    const expected = await canvasEvidence(browser);
    await app.screenshot("synthetic-square-crop");
    await screen
      .getByRole("button", { name: "Apply crop", exact: true })
      .click();
    await expect(url).toHaveValue(`/images/editorial/${expected.id}`, {
      timeout: 20_000,
    });
    expect(uploads).toBe(2);
    expect(expected.id).not.toBe(original.id);

    const saved = await storedImage(browser, expected.id);
    expect(saved).toMatchObject({
      ...expected,
      type: "image/png",
      declaredLength: String(expected.size),
      signature: [137, 80, 78, 71, 13, 10, 26, 10],
      ihdr: "IHDR",
      headerWidth: 800,
      headerHeight: 800,
    });
    const retained = await storedImage(browser, original.id);
    expect(retained).toMatchObject({
      ...original,
      type: "image/png",
      headerWidth: 2400,
      headerHeight: 1600,
    });

    await screen
      .getByRole("textbox", { name: "Alt text", exact: true })
      .fill("Synthetic cropped image");
    await screen
      .getByRole("button", { name: "Insert image", exact: true })
      .click();
    const inserted = screen.getByRole("img", {
      name: "Synthetic cropped image",
      exact: true,
    });
    await expect(inserted).toBeVisible();
    await expect(inserted).toHaveAttribute(
      "src",
      new RegExp(expected.id.replace(".", "\\.")),
    );
    await expect(browser.locator(".ProseMirror img")).toHaveCount(1);
    await app.screenshot("synthetic-cropped-image-in-article");
  },
);

test(
  "canceling a pending upload cannot overwrite a replacement or insert late media",
  { timeout: 90_000 },
  async (fixtures) => {
    const { browser, screen } = fixtures;
    await newArticle(fixtures);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let heldRequest = false;
    let lateRequestSettled = false;
    await browser.route(mediaRoute, async (route) => {
      if (route.request.method === "POST" && !heldRequest) {
        heldRequest = true;
        await held;
        // The inspector aborts the original request when canceled. A released
        // canceled request may reject; either outcome must leave replacement UI alone.
        try {
          await route.continue();
        } catch {
          /* The canceled browser request is already gone. */
        }
        lateRequestSettled = true;
        return;
      }
      await route.continue();
    });
    try {
      await openImage(fixtures);
      const abandoned = await selectSyntheticImage(browser);
      await expect.poll(() => heldRequest).toBe(true);
      await screen.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(browser.locator(".ProseMirror img")).toHaveCount(0);
      await openImage(fixtures);
      const replacement = await selectSyntheticImage(browser, true);
      expect(replacement.id).not.toBe(abandoned.id);
      const url = screen.getByRole("textbox", {
        name: "Image URL",
        exact: true,
      });
      await expect(url).toHaveValue(`/images/editorial/${replacement.id}`, {
        timeout: 20_000,
      });
      release();
      await expect.poll(() => lateRequestSettled).toBe(true);
      await expect(url).toHaveValue(`/images/editorial/${replacement.id}`);
      expect(await storedImage(browser, replacement.id)).toMatchObject(
        replacement,
      );
      await screen
        .getByRole("textbox", { name: "Alt text", exact: true })
        .fill("Synthetic replacement image");
      await screen
        .getByRole("button", { name: "Insert image", exact: true })
        .click();
      await expect(
        screen.getByRole("img", {
          name: "Synthetic replacement image",
          exact: true,
        }),
      ).toHaveAttribute("src", new RegExp(replacement.id.replace(".", "\\.")));
      await expect(browser.locator(".ProseMirror img")).toHaveCount(1);
      expect(
        await browser.evaluate(
          (id) =>
            Array.from(document.querySelectorAll(".ProseMirror img")).some(
              (image) => image.getAttribute("src")?.includes(id),
            ),
          abandoned.id,
        ),
      ).toBe(false);
    } finally {
      release();
    }
  },
);
