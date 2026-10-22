import { unlockSyntheticBrowserRecovery } from "../support/browser-recovery-key";
import { test, type Browser } from "@e2e-dev/web";
import { expect, type TestFixtures } from "e2e";

type Fixtures = Pick<TestFixtures, "app"> & { browser: Browser };

// e2e.admin.config.ts owns a disposable local D1/DO and both browser targets.
// Import the actual engine separately from the UI to qualify native crypto.
// Engine cases keep key files, key bytes and recovered input inside evaluate().
// The final UI case uses explicit synthetic title/address fixtures and the real
// file-input helper. Keys never enter logs or persisted storage. Channel
// qualification stores only task-owned ciphertext and restores it in finally.
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
        let releaseGate!: () => void;
        const gate = new Promise<void>((resolve) => {
          releaseGate = resolve;
        });
        release = releaseGate;
        const lockName = `editorial-recovery:${key}`;
        held = Promise.resolve(
          navigator.locks.request(lockName, async () => {
            entered();
            await gate;
          }),
        );
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
        releaseGate();
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

test(
  "native contested expiry preserves a discoverable encrypted copy and explicit recovery acknowledgment survives a tombstone",
  { timeout: 120_000 },
  async (fixtures) => {
    const page = await localEnginePage(fixtures);
    const result = await fixtures.browser.evaluate(async () => {
      const result = {
        localOnly: false,
        nativeLocks: false,
        lostCAS: false,
        endedKeyLocked: false,
        canonicalExact: false,
        legacyExact: false,
        ciphertextOnly: false,
        bothCopiesOffered: false,
        choiceArchivesCanonical: false,
        captureBytesPreserved: false,
        acknowledgedReady: false,
        tombstoneNoResurrection: false,
        noUnexpectedError: false,
      };
      if (
        location.protocol !== "http:" ||
        !["127.0.0.1", "localhost"].includes(location.hostname) ||
        !location.port
      )
        return result;
      result.localOnly = true;
      result.nativeLocks = Boolean(navigator.locks?.request);
      if (!result.nativeLocks) return result;
      const sessions: { lock(): void }[] = [];
      const channels: { close(): void }[] = [];
      let legacyKey = "";
      let canonicalKey = "";
      try {
        const enginePath = "/src/lib/browser-recovery-encryption.ts";
        const sessionPath = "/src/lib/browser-recovery-session.ts";
        const channelPath = "/src/lib/encrypted-browser-recovery.ts";
        const draftPath = "/src/lib/draft-recovery.ts";
        const engine = (await import(
          enginePath
        )) as typeof import("../../src/lib/browser-recovery-encryption");
        const lifecycle = (await import(
          sessionPath
        )) as typeof import("../../src/lib/browser-recovery-session");
        const recovery = (await import(
          channelPath
        )) as typeof import("../../src/lib/encrypted-browser-recovery");
        const drafts = (await import(
          draftPath
        )) as typeof import("../../src/lib/draft-recovery");
        const file = await engine.createBrowserRecoveryKeyFile();
        const owner = `synthetic-contested-${crypto.randomUUID()}`;
        const record = `native-${crypto.randomUUID()}`;
        legacyKey = drafts.recoveryKey(owner, { kind: "writing", id: record });
        const baseline = {
          source: "synthetic legacy café\r\n",
          saved: "synthetic saved\r\n",
          revision: 3,
          pending: null,
        };
        const theirs = {
          ...baseline,
          source: "synthetic competing canonical 雨\r\n",
        };
        const mine = {
          ...baseline,
          source: "synthetic ended current 雨 café\r\n",
          pending: {
            source: "synthetic ended retry\r\n",
            expectedRevision: 3,
            requestId: crypto.randomUUID(),
          },
        };
        const legacy = JSON.stringify(baseline);
        localStorage.setItem(legacyKey, legacy);
        const firstSession = new lifecycle.RecoverySession(() => true);
        const endedSession = new lifecycle.RecoverySession(() => true);
        sessions.push(firstSession, endedSession);
        await firstSession.unlock(file, owner);
        await endedSession.unlock(file, owner);
        const first = new recovery.EncryptedBrowserRecovery(
          localStorage,
          legacyKey,
          "draft",
          drafts.validateRecovery,
          firstSession,
        );
        const ended = new recovery.EncryptedBrowserRecovery(
          localStorage,
          legacyKey,
          "draft",
          drafts.validateRecovery,
          endedSession,
        );
        channels.push(first, ended);
        await first.read();
        await ended.read();
        if ((await first.write(theirs)) !== null) return result;
        canonicalKey = first.key;
        const canonical = localStorage.getItem(canonicalKey);
        result.lostCAS = (await ended.write(mine)) === "changed";
        if (!result.lostCAS) return result;
        let final: Promise<unknown> | undefined;
        const offCapture = endedSession.capture(() => {
          final = ended.sealFinal(mine);
          return final;
        });
        const locked = new Promise<void>((resolve) =>
          endedSession.subscribe(() => {
            if (endedSession.snapshot().status === "locked") resolve();
          }),
        );
        endedSession.end("expired");
        ended.close(); // Model actual form teardown after synchronous capture.
        await locked;
        offCapture();
        if ((await final) !== null) return result;
        result.endedKeyLocked = endedSession.vault.state.status === "locked";
        result.canonicalExact =
          localStorage.getItem(canonicalKey) === canonical;
        result.legacyExact = localStorage.getItem(legacyKey) === legacy;
        const captureKey = Object.keys(localStorage).find((key) =>
          key.startsWith(`${canonicalKey}:capture:`),
        );
        if (!captureKey) return result;
        const capture = localStorage.getItem(captureKey);
        result.ciphertextOnly = Object.keys(localStorage)
          .filter(
            (key) => key === canonicalKey || key.startsWith(`${canonicalKey}:`),
          )
          .every((key) => {
            const raw = localStorage.getItem(key) ?? "";
            return (
              !raw.includes(mine.source) &&
              !raw.includes(mine.pending.requestId) &&
              !raw.includes(JSON.parse(file).key)
            );
          });
        const reopenedSession = new lifecycle.RecoverySession(() => true);
        sessions.push(reopenedSession);
        await reopenedSession.unlock(file, owner);
        const reopen = () => {
          const channel = new recovery.EncryptedBrowserRecovery(
            localStorage,
            legacyKey,
            "draft",
            drafts.validateRecovery,
            reopenedSession,
          );
          channels.push(channel);
          return channel;
        };
        const reader = reopen();
        const offered = await reader.read();
        result.bothCopiesOffered =
          offered.status === "changed" &&
          JSON.stringify(offered.candidates?.map((copy) => copy.value)) ===
            JSON.stringify([theirs, mine]);
        if (!result.bothCopiesOffered || (await reader.choose(mine)) !== null)
          return result;
        result.choiceArchivesCanonical = Object.keys(localStorage).some(
          (key) =>
            key.startsWith(`${canonicalKey}:archive:`) &&
            localStorage.getItem(key) === canonical,
        );
        result.captureBytesPreserved =
          localStorage.getItem(captureKey) === capture;
        const ready = await reopen().read();
        result.acknowledgedReady =
          ready.status === "ready" &&
          JSON.stringify(ready.value) === JSON.stringify(mine);
        if ((await reader.write(null)) !== null) return result;
        result.tombstoneNoResurrection =
          (await reopen().read()).status === "missing";
        result.noUnexpectedError = true;
        return result;
      } catch {
        return result;
      } finally {
        for (const channel of channels) channel.close();
        for (const session of sessions) session.lock();
        for (const key of Object.keys(localStorage)) {
          if (
            (legacyKey && key === legacyKey) ||
            (canonicalKey &&
              (key === canonicalKey || key.startsWith(`${canonicalKey}:`)))
          )
            localStorage.removeItem(key);
        }
      }
    });
    expect(result).toEqual({
      localOnly: true,
      nativeLocks: true,
      lostCAS: true,
      endedKeyLocked: true,
      canonicalExact: true,
      legacyExact: true,
      ciphertextOnly: true,
      bothCopiesOffered: true,
      choiceArchivesCanonical: true,
      captureBytesPreserved: true,
      acknowledgedReady: true,
      tombstoneNoResurrection: true,
      noUnexpectedError: true,
    });
    expect(page.mutations()).toBe(0);
  },
);

test(
  "new article and project Back await native encryption before document unload",
  { timeout: 120_000 },
  async ({ app, browser, screen }) => {
    let mutations = 0;
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
          status: 409,
          json: { error: "synthetic_navigation_no_mutation" },
        });
      }
      return route.continue();
    });
    const offDialog = await browser.onDialog("dismiss");
    try {
      for (const project of [false, true]) {
        const path = project ? "/content/new-project" : "/content/new";
        const title = `Synthetic pending ${project ? "project" : "article"}`;
        const address = project
          ? "synthetic-custom-project-address"
          : "synthetic-custom-article-address";
        const snapshotKey = `synthetic-recovery-navigation:${project ? "project" : "article"}`;
        try {
          await app.open(path);
          await unlockSyntheticBrowserRecovery(browser);
          const field = screen.getByRole("textbox", {
            name: "Title",
            exact: true,
          });
          await expect(field).toBeEnabled();
          // This browser context is disposable. Never replace pre-existing input.
          await expect(field).toHaveValue("");
          expect(
            await browser.evaluate(
              async ({ project, snapshotKey }) => {
                const draftsPath = "/src/lib/draft-recovery.ts",
                  ownerPath = "/src/lib/editorial-owner.ts",
                  sessionPath = "/src/lib/browser-recovery-session.ts";
                const drafts = (await import(
                  draftsPath
                )) as typeof import("../../src/lib/draft-recovery");
                const { EDITORIAL_OWNER_EMAIL } = (await import(
                  ownerPath
                )) as typeof import("../../src/lib/editorial-owner");
                const { recoverySession } = (await import(
                  sessionPath
                )) as typeof import("../../src/lib/browser-recovery-session");
                await recoverySession().settled();
                const legacy = project
                  ? drafts.newProjectRecoveryKey(EDITORIAL_OWNER_EMAIL)
                  : drafts.newWritingRecoveryKey(EDITORIAL_OWNER_EMAIL);
                const channel = drafts.encryptedWritingRecovery(
                  localStorage,
                  legacy,
                );
                // Keep only the prior ciphertext in a task-owned session slot so the
                // finally block can restore this exact entry after real navigation.
                sessionStorage.setItem(
                  snapshotKey,
                  JSON.stringify({
                    key: channel.key,
                    raw: localStorage.getItem(channel.key),
                  }),
                );
                channel.close();
                const native = crypto.subtle.encrypt.bind(crypto.subtle);
                let release!: () => void;
                const held = new Promise<void>((resolve) => {
                  release = resolve;
                });
                const control = {
                  entered: false,
                  release,
                  restore: () => {
                    crypto.subtle.encrypt = native;
                  },
                };
                Reflect.set(window, "syntheticRecoveryNavigation", control);
                // Hold the actual first native encryption after the writer has
                // entered its real record/lifecycle Web Locks. No engine bypass.
                crypto.subtle.encrypt = async (...args) => {
                  if (!control.entered) {
                    control.entered = true;
                    await held;
                  }
                  return native(...args);
                };
                return true;
              },
              { project, snapshotKey },
            ),
          ).toBe(true);
          await field.fill(title);
          await expect
            .poll(() =>
              browser.evaluate(() =>
                Boolean(
                  (
                    Reflect.get(window, "syntheticRecoveryNavigation") as
                      { entered?: boolean } | undefined
                  )?.entered,
                ),
              ),
            )
            .toBe(true);
          await screen
            .getByRole("button", { name: "Edit address", exact: true })
            .click();
          const addressField = screen.getByRole("textbox", {
            name: project ? "Project address" : "Article address",
            exact: true,
          });
          await addressField.fill(address);
          await browser.locator("a.editor-bar-back").click();
          await expect(field).toHaveValue(title);
          await expect(
            screen.getByText("Keeping title before leaving", { exact: true }),
          ).toBeVisible();
          expect(new URL(await browser.url()).pathname).toBe(path);
          expect(
            await browser.evaluate(() => {
              const event = new Event("beforeunload", { cancelable: true });
              window.dispatchEvent(event);
              const control = Reflect.get(
                window,
                "syntheticRecoveryNavigation",
              ) as { release(): void; restore(): void } | undefined;
              control?.restore();
              control?.release();
              return event.defaultPrevented;
            }),
          ).toBe(true);
          await expect
            .poll(async () => new URL(await browser.url()).pathname)
            .toBe(project ? "/content/projects" : "/content/writing");
          // Finish the real library island hydration before deliberately
          // replacing this document with the recovery roundtrip.
          await expect
            .poll(
              () =>
                browser.evaluate(
                  () =>
                    document
                      .querySelector(
                        'astro-island[component-url*="EditorialApp"]',
                      )
                      ?.hasAttribute("ssr") === false,
                ),
              { timeout: 20_000 },
            )
            .toBe(true);
          // A real pagehide drops the key. Re-import through the actual input,
          // then verify the UI restores the exact title and custom address.
          await app.open(path);
          await unlockSyntheticBrowserRecovery(browser);
          await expect(field).toHaveValue(title);
          await screen
            .getByRole("button", { name: "Edit address", exact: true })
            .click();
          await expect(addressField).toHaveValue(address);
        } finally {
          await browser.evaluate(async (snapshotKey) => {
            const control = Reflect.get(
              window,
              "syntheticRecoveryNavigation",
            ) as { release(): void; restore(): void } | undefined;
            control?.restore();
            control?.release();
            Reflect.deleteProperty(window, "syntheticRecoveryNavigation");
            const sessionPath = "/src/lib/browser-recovery-session.ts";
            const { recoverySession } = (await import(
              sessionPath
            )) as typeof import("../../src/lib/browser-recovery-session");
            await recoverySession().settled();
            const raw = sessionStorage.getItem(snapshotKey);
            if (raw) {
              const prior = JSON.parse(raw) as {
                key: string;
                raw: string | null;
              };
              if (prior.key.startsWith("editorial-recovery:v3:")) {
                if (prior.raw === null) localStorage.removeItem(prior.key);
                else localStorage.setItem(prior.key, prior.raw);
              }
              sessionStorage.removeItem(snapshotKey);
            }
            recoverySession().lock();
            return true;
          }, snapshotKey);
        }
      }
      expect(mutations).toBe(0);
    } finally {
      await offDialog();
    }
  },
);
