import { readFile } from "node:fs/promises";
import { test, type Browser } from "@e2e-dev/web";
import { expect, type TestFixtures } from "e2e";

type Fixtures = Pick<TestFixtures, "app" | "screen"> & { browser: Browser };

// Only the disposable loopback harness is allowed. Downloaded key files belong
// to these synthetic attempts, never Ani. Do not log or assert raw key bytes.
async function localNewWriting({ app, browser, screen }: Fixtures) {
  let writes = 0;
  await browser.route(/\/api\//, async (route) => {
    if (["GET", "HEAD", "OPTIONS"].includes(route.request.method))
      return route.continue();
    writes++;
    await route.fulfill({ status: 503, json: { error: "synthetic_no_write" } });
  });
  await app.open("/content/new");
  expect(
    await browser.evaluate(
      () =>
        location.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(location.hostname) &&
        Boolean(location.port),
    ),
  ).toBe(true);
  await expect(
    screen.getByRole("heading", {
      name: "Unlock browser recovery",
      exact: true,
    }),
  ).toBeVisible({ timeout: 20_000 });
  return { writes: () => writes };
}

async function setupKey({ browser, screen }: Fixtures) {
  const download = await browser.waitForDownload(async () => {
    await screen
      .getByRole("button", { name: "Create a new recovery key", exact: true })
      .click();
  });
  expect(
    /^browser-recovery-key-[a-f0-9]{12}\.json$/.test(
      download.suggestedFilename,
    ),
  ).toBe(true);
  await expect(
    screen.getByText("Choose the key file you just saved", { exact: true }),
  ).toBeVisible();
  await expect(
    screen.getByRole("textbox", { name: "Title", exact: true }),
  ).not.toBeVisible();
  await browser
    .locator('input[type="file"][accept="application/json,.json"]')
    .setInputFiles(download.absolutePath);
  await expect(
    screen.getByRole("textbox", { name: "Title", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  return download.absolutePath;
}

async function ciphertextInventory(browser: Browser, marker: string) {
  return browser.evaluate((text) => {
    const entries = Object.keys(localStorage)
      .filter((key) => key.startsWith("editorial-recovery:v3:"))
      .map((key) => [key, localStorage.getItem(key)]);
    return {
      count: entries.length,
      noPlaintext: entries.every(([, raw]) => !raw?.includes(text)),
    };
  }, marker);
}

async function exactEncryptedTitle(
  browser: Browser,
  keyPath: string,
  title: string,
) {
  const file = await readFile(keyPath, "utf8");
  return browser.evaluate(
    async ({ file, title }) => {
      const enginePath = "/src/lib/browser-recovery-encryption.ts";
      const bundlePath = "/src/lib/browser-recovery-bundle.ts";
      const statePath = "/src/lib/browser-recovery.ts";
      const engine = (await import(
        enginePath
      )) as typeof import("../../src/lib/browser-recovery-encryption");
      const bundle = (await import(
        bundlePath
      )) as typeof import("../../src/lib/browser-recovery-bundle");
      const state = (await import(
        statePath
      )) as typeof import("../../src/lib/browser-recovery");
      const vault = new engine.BrowserRecoveryVault();
      try {
        await vault.unlock(file);
        const prefix = "editorial-recovery:v3:";
        const key = Object.keys(localStorage).find(
          (key) => key.startsWith(prefix) && !key.includes(":archive:"),
        );
        if (!key) return false;
        const parts = JSON.parse(key.slice(prefix.length));
        const opened = JSON.parse(
          await bundle.decryptRecoveryBundle(
            vault,
            localStorage.getItem(key)!,
            {
              origin: location.origin,
              ownerScope: parts[0],
              recordKind: parts[1],
              recordId: parts[2],
              logoutGeneration: localStorage.getItem(
                state.recoveryLogoutGenerationKey,
              ),
            },
          ),
        );
        return opened.payload?.title === title;
      } catch {
        return false;
      } finally {
        vault.lock();
      }
    },
    { file, title },
  );
}

async function selectWrongKey(browser: Browser) {
  await browser.evaluate(async () => {
    const moduleUrl = "/src/lib/browser-recovery-encryption.ts";
    const engine = (await import(
      moduleUrl
    )) as typeof import("../../src/lib/browser-recovery-encryption");
    const text = await engine.createBrowserRecoveryKeyFile();
    const input = document.querySelector<HTMLInputElement>(
      'input[type="file"][accept="application/json,.json"]',
    );
    if (!input || input.disabled)
      throw new Error("Synthetic key input unavailable");
    const files = new DataTransfer();
    files.items.add(
      new File([text], "wrong-synthetic-key.json", {
        type: "application/json",
      }),
    );
    input.files = files.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  });
}

async function inventoryDigest(browser: Browser) {
  return browser.evaluate(async () => {
    const entries = Object.keys(localStorage)
      .filter((key) => key.startsWith("editorial-recovery:v3:"))
      .sort()
      .map((key) => [key, localStorage.getItem(key)]);
    return Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(entries)),
        ),
      ),
    )
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  });
}

test(
  "saved key file is required after reload and wrong keys preserve encrypted input",
  { timeout: 120_000 },
  async (fixtures) => {
    const { browser, screen } = fixtures;
    const local = await localNewWriting(fixtures);
    const keyPath = await setupKey(fixtures);
    const marker = "Synthetic encrypted interrupted title";
    await screen
      .getByRole("textbox", { name: "Title", exact: true })
      .fill(marker);
    await expect
      .poll(() => ciphertextInventory(browser, marker))
      .toEqual({ count: 1, noPlaintext: true });
    await expect
      .poll(() => exactEncryptedTitle(browser, keyPath, marker))
      .toBe(true);
    const before = await inventoryDigest(browser);
    const offDialog = await browser.onDialog("accept");
    await browser.reload();
    await offDialog();
    await expect(
      screen.getByRole("heading", {
        name: "Unlock browser recovery",
        exact: true,
      }),
    ).toBeVisible({ timeout: 20_000 });
    await selectWrongKey(browser);
    await expect(screen.getByRole("alert")).toContainText(
      "This key does not match",
    );
    expect(await inventoryDigest(browser)).toBe(before);
    await browser
      .locator('input[type="file"][accept="application/json,.json"]')
      .setInputFiles(keyPath);
    await expect(
      screen.getByRole("textbox", { name: "Title", exact: true }),
    ).toHaveValue(marker, { timeout: 20_000 });
    const raw = await readFile(keyPath, "utf8");
    expect(
      await browser.evaluate((text) => {
        const key = JSON.parse(text).key as string;
        return Object.keys(localStorage).every(
          (name) => !localStorage.getItem(name)?.includes(key),
        );
      }, raw),
    ).toBe(true);
    expect(local.writes()).toBe(0);
  },
);

test(
  "lost key exports exact opaque copies without clearing or unlocking authoring",
  { timeout: 120_000 },
  async (fixtures) => {
    const { browser, screen } = fixtures;
    const local = await localNewWriting(fixtures);
    const keyPath = await setupKey(fixtures);
    const marker = "Synthetic lost key retained title";
    await screen
      .getByRole("textbox", { name: "Title", exact: true })
      .fill(marker);
    await expect
      .poll(() => ciphertextInventory(browser, marker))
      .toEqual({ count: 1, noPlaintext: true });
    await expect
      .poll(() => exactEncryptedTitle(browser, keyPath, marker))
      .toBe(true);
    const before = await inventoryDigest(browser);
    const offDialog = await browser.onDialog("accept");
    await browser.reload();
    await offDialog();
    await screen
      .getByRole("button", { name: "I no longer have the key", exact: true })
      .click();
    await expect(
      screen.getByText("Earlier encrypted copies are preserved", {
        exact: true,
      }),
    ).toBeVisible();
    const download = await browser.waitForDownload(async () => {
      await screen
        .getByRole("button", {
          name: "Download opaque recovery copies",
          exact: true,
        })
        .click();
    });
    const exported = await readFile(download.absolutePath, "utf8");
    const raw = await readFile(keyPath, "utf8");
    expect(
      await browser.evaluate(
        ({ exported, raw, marker }) => {
          const data = JSON.parse(exported);
          const entries = Object.fromEntries(
            Object.keys(localStorage)
              .filter((key) => key.startsWith("editorial-recovery:v3:"))
              .map((key) => [key, localStorage.getItem(key)]),
          );
          return (
            data.format === "anipotts.browser-recovery-opaque-export" &&
            data.version === 3 &&
            JSON.stringify(data.entries) === JSON.stringify(entries) &&
            !exported.includes(marker) &&
            !exported.includes(JSON.parse(raw).key)
          );
        },
        { exported, raw, marker },
      ),
    ).toBe(true);
    expect(await inventoryDigest(browser)).toBe(before);
    await expect(
      screen.getByRole("heading", {
        name: "Unlock browser recovery",
        exact: true,
      }),
    ).toBeVisible();
    expect(local.writes()).toBe(0);
  },
);

test(
  "session expiry seals current input then requires navigation and key re-import",
  { timeout: 120_000 },
  async (fixtures) => {
    const { browser, screen } = fixtures;
    const local = await localNewWriting(fixtures);
    const keyPath = await setupKey(fixtures);
    const marker = "Synthetic expiry current input";
    await screen
      .getByRole("textbox", { name: "Title", exact: true })
      .fill(marker);
    await browser.evaluate(async () => {
      const moduleUrl = "/src/lib/protected-admin-json.ts";
      const transport = (await import(
        moduleUrl
      )) as typeof import("../../src/lib/protected-admin-json");
      transport.lockProtectedSession("expired");
      return true;
    });
    await expect(
      screen.getByRole("heading", { name: "Session ended", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => ciphertextInventory(browser, marker))
      .toEqual({ count: 1, noPlaintext: true });
    await expect
      .poll(() => exactEncryptedTitle(browser, keyPath, marker))
      .toBe(true);
    const offDialog = await browser.onDialog("accept");
    await browser.reload();
    await offDialog();
    await expect(
      screen.getByRole("heading", {
        name: "Unlock browser recovery",
        exact: true,
      }),
    ).toBeVisible({ timeout: 20_000 });
    await browser
      .locator('input[type="file"][accept="application/json,.json"]')
      .setInputFiles(keyPath);
    await expect(
      screen.getByRole("textbox", { name: "Title", exact: true }),
    ).toHaveValue(marker, { timeout: 20_000 });
    expect(local.writes()).toBe(0);
  },
);
