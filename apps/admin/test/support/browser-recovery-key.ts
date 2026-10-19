import { expect } from "e2e";
import type { Browser } from "@e2e-dev/web";

/** Existing local journey suites import a public deterministic SYNTHETIC key
 * through the real hydrated file input and challenge. No application bypass,
 * persisted key, private content, download or key material crosses evaluate().
 * The stable fixture also permits re-import after a real reload in the same test.
 * Setup/download custody itself is covered by the separate owner acceptance. */
export async function unlockSyntheticBrowserRecovery(browser: Browser) {
  const selector = 'input[type="file"][accept="application/json,.json"]';
  if (
    !(await browser.evaluate(
      () =>
        location.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(location.hostname) &&
        Boolean(location.port),
    ))
  )
    throw new Error(
      "Synthetic recovery requires the disposable loopback owner harness",
    );
  await expect(browser.locator(selector)).toBeEnabled({ timeout: 20000 });
  const supplied = await browser.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>(
      'input[type="file"][accept="application/json,.json"]',
    );
    if (!input || input.disabled) return false;
    // This public seed is test data, never an application/user credential.
    const key = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          "anipotts disposable local browser recovery fixture v1",
        ),
      ),
    );
    const keyId = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", key)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    const text = JSON.stringify({
      format: "anipotts.browser-recovery-key",
      version: 1,
      algorithm: "AES-256-GCM",
      keyId,
      key: btoa(String.fromCharCode(...key))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, ""),
    });
    const files = new DataTransfer();
    files.items.add(
      new File([text], "synthetic-local-recovery-key.json", {
        type: "application/json",
      }),
    );
    input.files = files.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    key.fill(0);
    return true;
  });
  expect(supplied).toBe(true);
  await expect(browser.locator(selector)).not.toBeVisible({ timeout: 20000 });
}
