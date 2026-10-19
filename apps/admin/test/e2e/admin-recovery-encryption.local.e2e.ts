import { test, type Browser } from "@e2e-dev/web";
import { expect, type TestFixtures } from "e2e";

type Fixtures = Pick<TestFixtures, "app"> & { browser: Browser };

// e2e.admin.config.ts owns a disposable local D1/DO and both browser targets.
// Import the actual engine separately from the UI to qualify native crypto.
// Key files, key bytes and recovered input never leave evaluate(), enter the
// DOM/storage, get downloaded or appear in assertion/console output. Channel
// qualification stores only task-owned ciphertext and removes it in finally.
async function localEnginePage({ app, browser }: Fixtures) {
  let mutations = 0;
  await browser.route(/\/api\//, async (route) => {
    if (["GET", "HEAD", "OPTIONS"].includes(route.request.method))
      return route.continue();
    mutations++;
    await route.fulfill({
      status: 409,
      json: { error: "synthetic_encryption_no_mutation" },
    });
  });
  await app.open("/content/new");
  return { mutations: () => mutations };
}

test(
  "native recovery key re-import protects exact opaque input and ciphertext-only export bytes",
  { timeout: 120_000 },
  async (fixtures) => {
    const page = await localEnginePage(fixtures);
    const result = await fixtures.browser.evaluate(async () => {
      const failed = {
        localOnly: false,
        secureContext: false,
        nativeCrypto: false,
        freshKeyFiles: false,
        keyFile256Bits: false,
        missingKeyLocked: false,
        custodyChallenge: false,
        newDocumentLocked: false,
        exactOpaqueRoundTrip: false,
        ciphertextOnlyExport: false,
        fresh96BitNonces: false,
        noUnexpectedError: false,
      };
      if (
        location.protocol !== "http:" ||
        !["127.0.0.1", "localhost"].includes(location.hostname) ||
        !location.port
      )
        return failed;
      failed.localOnly = true;
      failed.secureContext = window.isSecureContext;
      failed.nativeCrypto = Boolean(crypto.subtle);
      const vaults: InstanceType<
        typeof import("../../src/lib/browser-recovery-encryption").BrowserRecoveryVault
      >[] = [];
      try {
        const moduleUrl = "/src/lib/browser-recovery-encryption.ts";
        const engine = (await import(
          moduleUrl
        )) as typeof import("../../src/lib/browser-recovery-encryption");
        const file = await engine.createBrowserRecoveryKeyFile();
        const otherFile = await engine.createBrowserRecoveryKeyFile();
        const keyFile = JSON.parse(file) as { key: string; keyId: string };
        const decodedKey = atob(
          keyFile.key.replaceAll("-", "+").replaceAll("_", "/"),
        );
        const context = {
          origin: location.origin,
          ownerScope: "synthetic-browser-crypto@example.test",
          recordKind: "writing" as const,
          recordId: "synthetic-browser-crypto",
          logoutGeneration: null,
        };
        const vault = new engine.BrowserRecoveryVault();
        vaults.push(vault);
        failed.missingKeyLocked = vault.state.status === "locked";
        failed.freshKeyFiles = file !== otherFile;
        failed.keyFile256Bits = decodedKey.length === 32;
        await vault.unlock(file);
        const challenge = "synthetic-key-custody-challenge";
        const protectedChallenge = await vault.encrypt(challenge, context);
        failed.custodyChallenge =
          (await vault.decrypt(protectedChallenge, context)) === challenge;

        const exact = JSON.stringify({
          source: "\uFEFF---\r\ntitle: synthetic\r\n---\r\ncafé 🌱 秘密\r\n",
          saved: "original baseline\r\n",
          revision: 7,
          pending: {
            source: "synthetic pending source\r\n",
            expectedRevision: 7,
            requestId: "11111111-1111-4111-8111-111111111111",
          },
          legacyRaw: "{corrupt-opaque-predecessor\r\n\ud800",
          acknowledgment: null,
        });
        const encrypted = await vault.encrypt(exact, context);
        const inspected = engine.inspectBrowserRecoveryEnvelope(encrypted);
        const envelope = JSON.parse(encrypted) as {
          header: { keyId: string };
          iv: string;
          ciphertext: string;
        };
        const nextDocument = new engine.BrowserRecoveryVault();
        vaults.push(nextDocument);
        failed.newDocumentLocked = nextDocument.state.status === "locked";
        vault.lock();
        // Re-import the held key-file text; no browser-persisted unlock exists.
        await nextDocument.unlock(file);
        failed.exactOpaqueRoundTrip =
          (await nextDocument.decrypt(encrypted, context)) === exact;

        // Exercise actual browser Blob export bytes without creating a URL or
        // triggering a download. Return booleans only, never the export itself.
        const exportBytes = await new Blob([encrypted], {
          type: "application/json",
        }).text();
        failed.ciphertextOnlyExport =
          exportBytes === encrypted &&
          (await nextDocument.decrypt(exportBytes, context)) === exact &&
          Object.keys(envelope).sort().join("|") === "ciphertext|header|iv" &&
          inspected.version === 3 &&
          !exportBytes.includes(keyFile.key) &&
          !exportBytes.includes("synthetic pending source") &&
          !exportBytes.includes("corrupt-opaque-predecessor") &&
          !exportBytes.includes("11111111-1111-4111-8111-111111111111") &&
          !exportBytes.includes(exact);
        failed.fresh96BitNonces =
          envelope.iv !== JSON.parse(protectedChallenge).iv &&
          atob(envelope.iv.replaceAll("-", "+").replaceAll("_", "/")).length ===
            12;
        failed.noUnexpectedError = true;
        return failed;
      } catch {
        // Never return arbitrary native errors, stack traces or key-bearing data.
        return failed;
      } finally {
        for (const vault of vaults) vault.lock();
      }
    });
    expect(result).toEqual({
      localOnly: true,
      secureContext: true,
      nativeCrypto: true,
      freshKeyFiles: true,
      keyFile256Bits: true,
      missingKeyLocked: true,
      custodyChallenge: true,
      newDocumentLocked: true,
      exactOpaqueRoundTrip: true,
      ciphertextOnlyExport: true,
      fresh96BitNonces: true,
      noUnexpectedError: true,
    });
    expect(page.mutations()).toBe(0);
  },
);

test(
  "native recovery authentication rejects wrong keys and tampering while lock invalidates pending encryption",
  { timeout: 120_000 },
  async (fixtures) => {
    const page = await localEnginePage(fixtures);
    const result = await fixtures.browser.evaluate(async () => {
      const failed = {
        localOnly: false,
        wrongKey: "unexpected",
        wrongMaterial: "unexpected",
        headerTamper: "unexpected",
        tagTamper: "unexpected",
        wrongGeneration: "unexpected",
        pendingAfterLock: "unexpected",
        missingKey: "unexpected",
        lostKey: "unexpected",
        originalStillRecoverable: false,
        noUnexpectedError: false,
      };
      if (
        location.protocol !== "http:" ||
        !["127.0.0.1", "localhost"].includes(location.hostname) ||
        !location.port
      )
        return failed;
      failed.localOnly = true;
      const vaults: InstanceType<
        typeof import("../../src/lib/browser-recovery-encryption").BrowserRecoveryVault
      >[] = [];
      try {
        const moduleUrl = "/src/lib/browser-recovery-encryption.ts";
        const engine = (await import(
          moduleUrl
        )) as typeof import("../../src/lib/browser-recovery-encryption");
        const code = async (operation: Promise<unknown>) => {
          try {
            await operation;
            return "unexpected-success";
          } catch (error) {
            // Only these fixed, reviewed error codes can leave the browser.
            if (
              error instanceof engine.RecoveryEncryptionError &&
              [
                "key-id-mismatch",
                "authentication-failed",
                "context-mismatch",
                "stale",
                "key-required",
                "key-lost",
              ].includes(error.problem)
            )
              return error.problem;
            return "unexpected";
          }
        };
        const file = await engine.createBrowserRecoveryKeyFile();
        const otherFile = await engine.createBrowserRecoveryKeyFile();
        const vault = new engine.BrowserRecoveryVault();
        const otherVault = new engine.BrowserRecoveryVault();
        vaults.push(vault, otherVault);
        await vault.unlock(file);
        await otherVault.unlock(otherFile);
        const context = {
          origin: location.origin,
          ownerScope: "synthetic-browser-crypto@example.test",
          recordKind: "writing" as const,
          recordId: "synthetic-browser-crypto",
          logoutGeneration: null,
        };
        const exact = "synthetic retained opaque input\r\n café 🌱\ud800";
        const original = await vault.encrypt(exact, context);
        failed.wrongKey = await code(otherVault.decrypt(original, context));

        const wrongMaterial = JSON.parse(original);
        wrongMaterial.header.keyId = JSON.parse(otherFile).keyId;
        failed.wrongMaterial = await code(
          otherVault.decrypt(JSON.stringify(wrongMaterial), context),
        );
        const differentOwner = {
          ...context,
          ownerScope: "other-synthetic-owner@example.test",
        };
        const headerTamper = JSON.parse(original);
        headerTamper.header.ownerScope = differentOwner.ownerScope;
        failed.headerTamper = await code(
          vault.decrypt(JSON.stringify(headerTamper), differentOwner),
        );
        const tagTamper = JSON.parse(original);
        const cipher = Uint8Array.from(
          atob(tagTamper.ciphertext.replaceAll("-", "+").replaceAll("_", "/")),
          (character) => character.charCodeAt(0),
        );
        cipher[cipher.length - 1]! ^= 1;
        tagTamper.ciphertext = btoa(String.fromCharCode(...cipher))
          .replaceAll("+", "-")
          .replaceAll("/", "_")
          .replace(/=+$/, "");
        failed.tagTamper = await code(
          vault.decrypt(JSON.stringify(tagTamper), context),
        );
        failed.wrongGeneration = await code(
          vault.decrypt(original, {
            ...context,
            logoutGeneration: "22222222-2222-4222-8222-222222222222",
          }),
        );
        // Native encrypt is asynchronous. Lock synchronously before its result
        // can resume; no delays, cipher substitutions or crypto mocks are used.
        const pending = vault.encrypt("synthetic pending encryption", context);
        vault.lock();
        failed.pendingAfterLock = await code(pending);
        failed.missingKey = await code(vault.decrypt(original, context));
        vault.lock("key-lost");
        failed.lostKey = await code(vault.decrypt(original, context));
        await vault.unlock(file);
        failed.originalStillRecoverable =
          (await vault.decrypt(original, context)) === exact;
        failed.noUnexpectedError = true;
        return failed;
      } catch {
        return failed;
      } finally {
        for (const vault of vaults) vault.lock();
      }
    });
    expect(result).toEqual({
      localOnly: true,
      wrongKey: "key-id-mismatch",
      wrongMaterial: "authentication-failed",
      headerTamper: "authentication-failed",
      tagTamper: "authentication-failed",
      wrongGeneration: "context-mismatch",
      pendingAfterLock: "stale",
      missingKey: "key-required",
      lostKey: "key-lost",
      originalStillRecoverable: true,
      noUnexpectedError: true,
    });
    expect(page.mutations()).toBe(0);
  },
);

test(
  "native recovery coalesces held-lock snapshots without acknowledging superseded durability",
  { timeout: 120_000 },
  async (fixtures) => {
    const page = await localEnginePage(fixtures);
    const result = await fixtures.browser.evaluate(async () => {
      const result = {
        localOnly: false,
        nativeCrypto: false,
        nativeLocks: false,
        validSnapshots: 0,
        blockedNativeWriter: false,
        pendingWhileHeld: 0,
        superseded: 0,
        writesWhileHeld: 0,
        committed: 0,
        ciphertextWrites: 0,
        exactCapturedFirst: false,
        exactStoredLatest: false,
        noUnexpectedError: false,
      };
      if (
        location.protocol !== "http:" ||
        !["127.0.0.1", "localhost"].includes(location.hostname) ||
        !location.port
      )
        return result;
      result.localOnly = true;
      result.nativeCrypto = Boolean(crypto.subtle);
      result.nativeLocks = Boolean(navigator.locks);
      if (!result.nativeCrypto || !result.nativeLocks) return result;
      let release: (() => void) | undefined;
      let held: Promise<void> | undefined;
      let session:
        | InstanceType<
            typeof import("../../src/lib/browser-recovery-session").RecoverySession
          >
        | undefined;
      let storageKey: string | undefined;
      try {
        const engineUrl = "/src/lib/browser-recovery-encryption.ts";
        const channelUrl = "/src/lib/encrypted-browser-recovery.ts";
        const sessionUrl = "/src/lib/browser-recovery-session.ts";
        const draftUrl = "/src/lib/draft-recovery.ts";
        const bundleUrl = "/src/lib/browser-recovery-bundle.ts";
        const engine = (await import(
          engineUrl
        )) as typeof import("../../src/lib/browser-recovery-encryption");
        const channels = (await import(
          channelUrl
        )) as typeof import("../../src/lib/encrypted-browser-recovery");
        const sessions = (await import(
          sessionUrl
        )) as typeof import("../../src/lib/browser-recovery-session");
        const drafts = (await import(
          draftUrl
        )) as typeof import("../../src/lib/draft-recovery");
        const bundles = (await import(
          bundleUrl
        )) as typeof import("../../src/lib/browser-recovery-bundle");
        session = new sessions.RecoverySession(() => true);
        const owner = "synthetic-browser-queue@example.test";
        await session.unlock(
          await engine.createBrowserRecoveryKeyFile(),
          owner,
        );
        const key = drafts.recoveryKey(owner, {
          kind: "writing",
          id: `synthetic-queue-${crypto.randomUUID()}`,
        });
        const ciphertext: string[] = [];
        // Delegate to native Storage. Observe this unique record's ciphertext
        // writes without replacing crypto, Web Locks or another record's data.
        const storage = new Proxy(localStorage, {
          get(target, property) {
            if (property === "setItem")
              return (name: string, raw: string) => {
                target.setItem(name, raw);
                if (name === storageKey) ciphertext.push(raw);
              };
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        const channel = new channels.EncryptedBrowserRecovery(
          storage,
          key,
          "draft",
          drafts.validateRecovery,
          session,
        );
        storageKey = channel.key;
        if ((await channel.read()).status !== "missing") return result;
        let entered!: () => void;
        const admitted = new Promise<void>((resolve) => {
          entered = resolve;
        });
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const lockName = `editorial-recovery:${key}`;
        held = navigator.locks.request(lockName, async () => {
          entered();
          await gate;
        });
        await admitted;
        const snapshot = (index: number) => ({
          source: String(index).padEnd(128 * 1024, "s"),
          saved: "b".repeat(128 * 1024),
          revision: 1,
          pending: {
            source: "r".repeat(128 * 1024),
            expectedRevision: 1,
            requestId: "11111111-1111-4111-8111-111111111111",
          },
        });
        let pending = 0;
        const operations = Array.from({ length: 24 }, (_, index) => {
          const input = snapshot(index);
          if (drafts.validateRecovery(input)) result.validSnapshots++;
          pending++;
          const operation = channel.write(input).finally(() => pending--);
          // No queued task may subsequently read this mutable caller input.
          input.source = input.saved = input.pending.source = "";
          return operation;
        });
        const replaced = await Promise.all(operations.slice(1, -1));
        result.superseded = replaced.filter(
          (outcome) => outcome === "superseded",
        ).length;
        result.pendingWhileHeld = pending;
        result.writesWhileHeld = ciphertext.length;
        // Query native admission, rather than waiting an arbitrary duration.
        // The bounded queries yield to the lock manager until the channel's
        // record request is visibly queued behind our held native lock.
        for (let attempt = 0; attempt < 32; attempt++) {
          const locks = await navigator.locks.query();
          if (locks.pending?.some((lock) => lock.name === lockName)) {
            result.blockedNativeWriter = true;
            break;
          }
        }
        release();
        await held;
        const outcomes = await Promise.all(operations);
        result.committed = outcomes.filter(
          (outcome) => outcome === null,
        ).length;
        result.ciphertextWrites = ciphertext.length;
        if (ciphertext.length === 2) {
          const first = JSON.parse(
            await bundles.decryptRecoveryBundle(
              session.vault,
              ciphertext[0]!,
              channel.context,
            ),
          );
          result.exactCapturedFirst =
            JSON.stringify(first.payload) === JSON.stringify(snapshot(0));
          const latest = localStorage.getItem(channel.key);
          if (latest !== null) {
            const recovered = JSON.parse(
              await bundles.decryptRecoveryBundle(
                session.vault,
                latest,
                channel.context,
              ),
            );
            result.exactStoredLatest =
              latest === ciphertext[1] &&
              JSON.stringify(recovered.payload) ===
                JSON.stringify(snapshot(23));
          }
        }
        channel.close();
        result.noUnexpectedError = true;
        return result;
      } catch {
        // Only fixed booleans/counts leave evaluate, including on native failure.
        return result;
      } finally {
        release?.();
        await held?.catch(() => {});
        session?.lock();
        if (storageKey) localStorage.removeItem(storageKey);
      }
    });
    expect(result).toEqual({
      localOnly: true,
      nativeCrypto: true,
      nativeLocks: true,
      validSnapshots: 24,
      blockedNativeWriter: true,
      pendingWhileHeld: 2,
      superseded: 22,
      writesWhileHeld: 0,
      committed: 2,
      ciphertextWrites: 2,
      exactCapturedFirst: true,
      exactStoredLatest: true,
      noUnexpectedError: true,
    });
    expect(page.mutations()).toBe(0);
  },
);
