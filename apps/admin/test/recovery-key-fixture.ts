/** Explicit synthetic key custody for component tests. Never imported by app
 * code, never changes Access admission, and creates no files or downloads. */
import { webcrypto } from "node:crypto";
import { vi } from "vitest";
let fixtureFile: string;
export async function unlockRecoveryFixture(reuse = false) {
  vi.stubGlobal("crypto", webcrypto);
  const { recoverySession } =
    await import("../src/lib/browser-recovery-session");
  const { createBrowserRecoveryKeyFile } =
    await import("../src/lib/browser-recovery-encryption");
  const session = recoverySession();
  if (!reuse || !fixtureFile)
    fixtureFile = await createBrowserRecoveryKeyFile();
  await session.unlock(fixtureFile, "synthetic-component-fixture");
  return session;
}
export async function settleRecoveryFixture() {
  const { recoverySession } =
    await import("../src/lib/browser-recovery-session");
  await recoverySession().settled();
}
export async function openRecoveryExportFixture(
  serialized: string,
  key: string,
  kind: "draft" | "new-writing" = "draft",
) {
  const { EncryptedBrowserRecovery } =
    await import("../src/lib/encrypted-browser-recovery");
  const { recoverySession } =
    await import("../src/lib/browser-recovery-session");
  const { decryptRecoveryBundle } =
    await import("../src/lib/browser-recovery-bundle");
  const session = recoverySession();
  const channel = new EncryptedBrowserRecovery(
    localStorage,
    key,
    kind,
    (value) => value,
    session,
  );
  return JSON.parse(
    await decryptRecoveryBundle(session.vault, serialized, channel.context),
  );
}
export async function readRecoveryFixture(
  key: string,
  kind: "draft" | "new-writing" = "draft",
) {
  await settleRecoveryFixture();
  const { EncryptedBrowserRecovery } =
    await import("../src/lib/encrypted-browser-recovery");
  const { validateRecovery, validateNewWritingRecovery } =
    await import("../src/lib/draft-recovery");
  const validator = (
    kind === "draft" ? validateRecovery : validateNewWritingRecovery
  ) as (value: unknown) => any;
  // Inspect expiry persistence with the held test key in a separate isolated
  // vault. This does not reopen the locked application's document session.
  const { RecoverySession } =
    await import("../src/lib/browser-recovery-session");
  const session = new RecoverySession(() => true);
  await session.unlock(fixtureFile, "synthetic-component-fixture");
  const result = await new EncryptedBrowserRecovery(
    localStorage,
    key,
    kind,
    validator,
    session,
  ).read();
  session.lock();
  return result.status === "ready" ? result.value : null;
}
