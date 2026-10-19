import { test, type Browser } from "@e2e-dev/web";
import { expect, type TestFixtures } from "e2e";
import { unlockSyntheticBrowserRecovery } from "../support/browser-recovery-key";

type Fixtures = Pick<TestFixtures, "app" | "screen"> & { browser: Browser };
const peerName = "anipotts-synthetic-recovery-lifecycle";
const keyInput = 'input[type="file"][accept="application/json,.json"]';

async function localOnly({ app, browser }: Fixtures) {
  let mutations = 0;
  // The installed adapter implements these routes/scripts on BrowserContext,
  // including the task-owned popup. No request can mutate an API or reach Access.
  await browser.route(/.*/, async (route) => {
    const url = new URL(route.request.url);
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.port ||
      url.pathname.startsWith("/cdn-cgi/access/")
    )
      return route.fulfill({ status: 403, body: "synthetic_local_only" });
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request.method)) {
      mutations++;
      return route.fulfill({
        status: 503,
        json: { error: "synthetic_no_write" },
      });
    }
    return route.continue();
  });
  await browser.addInitScript(() => {
    const receipt = { storage: false, pagehide: false };
    Reflect.set(window, "syntheticRecoveryLifecycle", receipt);
    window.addEventListener("storage", (event) => {
      if (event.key === "editorial-recovery:logout" && event.newValue)
        receipt.storage = event.isTrusted;
    });
    window.addEventListener("pagehide", (event) => {
      receipt.pagehide = event.isTrusted;
    });
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
  return () => mutations;
}

async function openPeer(browser: Browser) {
  expect(
    await browser.evaluate((name) => {
      const peer = window.open("/content/new", name);
      Reflect.set(window, "syntheticRecoveryPeer", peer);
      return Boolean(peer);
    }, peerName),
  ).toBe(true);
  await expect
    .poll(() =>
      browser.evaluate((selector) => {
        const peer = Reflect.get(
          window,
          "syntheticRecoveryPeer",
        ) as Window | null;
        if (!peer || peer.closed) return false;
        try {
          const input = peer.document.querySelector<HTMLInputElement>(selector);
          return (
            peer.location.origin === location.origin &&
            Boolean(input && !input.disabled) &&
            !peer.document.querySelector('textarea[aria-label="Title"]')
          );
        } catch {
          return false;
        }
      }, keyInput),
    )
    .toBe(true);
}

async function importPeerKey(browser: Browser) {
  // Same public deterministic fixture as the normal browser helper. The key is
  // constructed only inside the browser and supplied through the child's real
  // hydrated input. Only the fixed boolean crosses the evaluate boundary.
  expect(
    await browser.evaluate(async (selector) => {
      const peer = Reflect.get(window, "syntheticRecoveryPeer") as
        (Window & typeof globalThis) | null;
      if (!peer || peer.closed || peer.location.origin !== location.origin)
        return false;
      const input = peer.document.querySelector<HTMLInputElement>(selector);
      if (!input || input.disabled) return false;
      const bytes = new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(
            "anipotts disposable local browser recovery fixture v1",
          ),
        ),
      );
      try {
        const keyId = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (byte) => byte.toString(16).padStart(2, "0"),
        ).join("");
        const text = JSON.stringify({
          format: "anipotts.browser-recovery-key",
          version: 1,
          algorithm: "AES-256-GCM",
          keyId,
          key: btoa(String.fromCharCode(...bytes))
            .replaceAll("+", "-")
            .replaceAll("/", "_")
            .replace(/=+$/, ""),
        });
        const files = new peer.DataTransfer();
        files.items.add(
          new peer.File([text], "synthetic-local-recovery-key.json", {
            type: "application/json",
          }),
        );
        input.files = files.files;
        input.dispatchEvent(new peer.Event("change", { bubbles: true }));
        return true;
      } finally {
        bytes.fill(0);
      }
    }, keyInput),
  ).toBe(true);
  await expect
    .poll(() =>
      browser.evaluate(() => {
        const peer = Reflect.get(
          window,
          "syntheticRecoveryPeer",
        ) as Window | null;
        return Boolean(
          peer?.document.querySelector('textarea[aria-label="Title"]'),
        );
      }),
    )
    .toBe(true);
}

async function closePeer(browser: Browser) {
  // Close only the task's WindowProxy, allowing its dialog handler to finish.
  await browser.evaluate(() => {
    const peer = Reflect.get(window, "syntheticRecoveryPeer") as Window | null;
    if (peer && !peer.closed) peer.close();
    return true;
  });
  await expect
    .poll(() =>
      browser.evaluate(() => {
        const peer = Reflect.get(
          window,
          "syntheticRecoveryPeer",
        ) as Window | null;
        return !peer || peer.closed;
      }),
    )
    .toBe(true);
  await browser.evaluate(() => {
    Reflect.deleteProperty(window, "syntheticRecoveryPeer");
    Reflect.deleteProperty(window, "syntheticRecoveryPriorDocument");
    Reflect.deleteProperty(window, "syntheticRecoveryPriorReceipt");
    return true;
  });
}

async function recoveryDigest(browser: Browser) {
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
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
  });
}

async function storedTitleMatches(browser: Browser, title: string) {
  return browser.evaluate(async (expected) => {
    const bytes = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          "anipotts disposable local browser recovery fixture v1",
        ),
      ),
    );
    const enginePath = "/src/lib/browser-recovery-encryption.ts";
    const bundlePath = "/src/lib/browser-recovery-bundle.ts";
    const { BrowserRecoveryVault } = (await import(
      enginePath
    )) as typeof import("../../src/lib/browser-recovery-encryption");
    const { decryptRecoveryBundle } = (await import(
      bundlePath
    )) as typeof import("../../src/lib/browser-recovery-bundle");
    const vault = new BrowserRecoveryVault();
    try {
      const keyId = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      await vault.unlock(
        JSON.stringify({
          format: "anipotts.browser-recovery-key",
          version: 1,
          algorithm: "AES-256-GCM",
          keyId,
          key: btoa(String.fromCharCode(...bytes))
            .replaceAll("+", "-")
            .replaceAll("/", "_")
            .replace(/=+$/, ""),
        }),
      );
      const prefix = "editorial-recovery:v3:";
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith(prefix) || key.includes(":archive:")) continue;
        const parts = JSON.parse(key.slice(prefix.length));
        if (parts[1] !== "new-writing" || parts[2] !== "new") continue;
        const opened = JSON.parse(
          await decryptRecoveryBundle(vault, localStorage.getItem(key)!, {
            origin: location.origin,
            ownerScope: parts[0],
            recordKind: "new-writing",
            recordId: "new",
            logoutGeneration: localStorage.getItem("editorial-recovery:logout"),
          }),
        );
        if (opened.payload?.title === expected) return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      vault.lock();
      bytes.fill(0);
    }
  }, title);
}

async function settleLocalRecovery(browser: Browser) {
  // Synchronizes real pending crypto; it neither unlocks nor changes admission.
  await browser.evaluate(async () => {
    const path = "/src/lib/browser-recovery-session.ts";
    const { recoverySession } = (await import(
      path
    )) as typeof import("../../src/lib/browser-recovery-session");
    await recoverySession().settled();
    return true;
  });
}

test(
  "two documents unlock independently, retain a CAS conflict, and native logout storage events revoke the old document",
  { timeout: 120_000 },
  async (fixtures) => {
    const { browser, screen } = fixtures;
    const mutations = await localOnly(fixtures);
    await unlockSyntheticBrowserRecovery(browser);
    const baseline = "Synthetic first tab preserved title";
    const contested = "Synthetic first tab conflicting title";
    await screen
      .getByRole("textbox", { name: "Title", exact: true })
      .fill(baseline);
    await settleLocalRecovery(browser);
    const offDialog = await browser.onDialog("accept");
    try {
      await openPeer(browser);
      // Unlocking the parent did not give this new document a live key handle.
      await importPeerKey(browser);
      await expect
        .poll(() =>
          browser.evaluate((text) => {
            const peer = Reflect.get(window, "syntheticRecoveryPeer") as Window;
            return (
              peer.document.querySelector<HTMLTextAreaElement>(
                'textarea[aria-label="Title"]',
              )?.value === text
            );
          }, baseline),
        )
        .toBe(true);
      // The child uses the native setter/event path, producing a real competing
      // write rather than changing storage or the recovery channel by hand.
      const childTitle = "Synthetic second tab retained title";
      const beforeChild = await recoveryDigest(browser);
      expect(
        await browser.evaluate((text) => {
          const peer = Reflect.get(window, "syntheticRecoveryPeer") as Window &
            typeof globalThis;
          const input = peer.document.querySelector<HTMLTextAreaElement>(
            'textarea[aria-label="Title"]',
          );
          if (!input) return false;
          Object.getOwnPropertyDescriptor(
            peer.HTMLTextAreaElement.prototype,
            "value",
          )!.set!.call(input, text);
          input.dispatchEvent(new peer.Event("input", { bubbles: true }));
          return true;
        }, childTitle),
      ).toBe(true);
      // Observe a completed child write without returning ciphertext. Its bundle
      // changes after the native input event and must settle before parent edits.
      await expect
        .poll(() => storedTitleMatches(browser, childTitle))
        .toBe(true);
      expect(await recoveryDigest(browser)).not.toBe(beforeChild);
      const childStored = await recoveryDigest(browser);
      await screen
        .getByRole("textbox", { name: "Title", exact: true })
        .fill(contested);
      await expect(
        screen.getByText("Browser recovery needs attention", { exact: true }),
      ).toBeVisible();
      await expect(
        screen.getByText(/Another tab changed browser recovery/),
      ).toBeVisible();
      await settleLocalRecovery(browser);
      expect(await recoveryDigest(browser)).toBe(childStored);
      expect(
        await browser.evaluate(
          ({ parent, child }) => {
            const peer = Reflect.get(window, "syntheticRecoveryPeer") as Window;
            return (
              document.querySelector<HTMLTextAreaElement>(
                'textarea[aria-label="Title"]',
              )?.value === parent &&
              peer.document.querySelector<HTMLTextAreaElement>(
                'textarea[aria-label="Title"]',
              )?.value === child
            );
          },
          { parent: contested, child: childTitle },
        ),
      ).toBe(true);

      // This is a native localStorage mutation in the OTHER browsing context,
      // not a synthetic StorageEvent or an actual Cloudflare Access sign-out.
      expect(
        await browser.evaluate(() => {
          const peer = Reflect.get(window, "syntheticRecoveryPeer") as Window;
          peer.localStorage.setItem(
            "editorial-recovery:logout",
            crypto.randomUUID(),
          );
          return true;
        }),
      ).toBe(true);
      await expect
        .poll(() =>
          browser.evaluate(
            () =>
              Reflect.get(window, "syntheticRecoveryLifecycle")?.storage ===
              true,
          ),
        )
        .toBe(true);
      await expect(
        screen.getByRole("heading", { name: "Session ended", exact: true }),
      ).toBeVisible();
      const afterLogout = await recoveryDigest(browser);
      // The helper cannot be used because it waits for an unlocked input. Here
      // actual old-document admission must leave the key input absent/disabled.
      expect(
        await browser.evaluate((selector) => {
          const input = document.querySelector<HTMLInputElement>(selector);
          return !input || input.disabled;
        }, keyInput),
      ).toBe(true);
      const path = "/src/lib/browser-recovery-session.ts";
      expect(
        await browser.evaluate(async (modulePath) => {
          const { recoverySession } = (await import(
            modulePath
          )) as typeof import("../../src/lib/browser-recovery-session");
          return recoverySession().vault.state.status === "locked";
        }, path),
      ).toBe(true);
      expect(await recoveryDigest(browser)).toBe(afterLogout);
      expect(mutations()).toBe(0);
    } finally {
      await closePeer(browser);
      await offDialog();
    }
  },
);

test(
  "actual pagehide and history return require a fresh recovery unlock or retain the locked document fence",
  { timeout: 120_000 },
  async (fixtures) => {
    const { browser } = fixtures;
    const mutations = await localOnly(fixtures);
    const offDialog = await browser.onDialog("accept");
    try {
      await openPeer(browser);
      await importPeerKey(browser);
      expect(
        await browser.evaluate(() => {
          const peer = Reflect.get(window, "syntheticRecoveryPeer") as Window;
          Reflect.set(window, "syntheticRecoveryPriorDocument", peer.document);
          Reflect.set(
            window,
            "syntheticRecoveryPriorReceipt",
            Reflect.get(peer, "syntheticRecoveryLifecycle"),
          );
          peer.location.assign("/content");
          return true;
        }),
      ).toBe(true);
      await expect
        .poll(() =>
          browser.evaluate(() => {
            const peer = Reflect.get(window, "syntheticRecoveryPeer") as Window;
            return (
              peer.location.pathname === "/content" &&
              peer.document.readyState === "complete"
            );
          }),
        )
        .toBe(true);
      await expect
        .poll(() =>
          browser.evaluate(
            () =>
              Reflect.get(window, "syntheticRecoveryPriorReceipt")?.pagehide ===
              true,
          ),
        )
        .toBe(true);
      await browser.evaluate(() => {
        const peer = Reflect.get(window, "syntheticRecoveryPeer") as Window;
        peer.history.back();
        return true;
      });
      await expect
        .poll(() =>
          browser.evaluate((selector) => {
            const peer = Reflect.get(window, "syntheticRecoveryPeer") as Window;
            if (peer.location.pathname !== "/content/new") return false;
            const returnedSameDocument =
              peer.document ===
              Reflect.get(window, "syntheticRecoveryPriorDocument");
            const title = peer.document.querySelector(
              'textarea[aria-label="Title"]',
            );
            const input =
              peer.document.querySelector<HTMLInputElement>(selector);
            return (
              !title &&
              (returnedSameDocument
                ? peer.document.body.textContent?.includes("Session ended") ===
                  true
                : Boolean(input && !input.disabled))
            );
          }, keyInput),
        )
        .toBe(true);
      expect(mutations()).toBe(0);
      // No assertion that BFCache was used: both native navigation outcomes are
      // supported, and either must prevent authoring with the prior key handle.
    } finally {
      await closePeer(browser);
      await offDialog();
    }
  },
);
