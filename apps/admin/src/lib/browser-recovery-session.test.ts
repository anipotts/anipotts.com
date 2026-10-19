// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecoverySession } from "./browser-recovery-session";
import {
  createBrowserRecoveryKeyFile,
  type RecoveryEncryptionContext,
} from "./browser-recovery-encryption";

const scope = "synthetic-owner";
const context: RecoveryEncryptionContext = {
  origin: "http://localhost:3000",
  ownerScope: scope,
  recordKind: "new-writing",
  recordId: "synthetic-session-test",
  logoutGeneration: null,
};

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["encrypt", "decrypt"] as const)(
  "drops the imported handle after a native %s challenge failure",
  async (method) => {
    const file = await createBrowserRecoveryKeyFile();
    const session = new RecoverySession(() => true);
    const failure = new DOMException(
      "synthetic crypto failure",
      "OperationError",
    );
    vi.spyOn(webcrypto.subtle, method).mockRejectedValueOnce(failure);

    await expect(session.unlock(file, scope)).rejects.toMatchObject({
      problem: method === "encrypt" ? "unavailable" : "authentication-failed",
    });
    expect(session.snapshot()).toEqual({
      status: "locked",
      keyId: null,
      lost: false,
    });
    expect(session.capability()).toBeNull();
    expect(session.vault.state.status).toBe("locked");
    // Expiry is a no-op on an already locked session; no key may depend on it.
    session.end("expired");
    await expect(
      session.vault.encrypt("unavailable", context),
    ).rejects.toMatchObject({
      problem: "key-required",
    });
  },
);

it("drops imported handles when the challenge decrypts to the wrong value", async () => {
  const session = new RecoverySession(() => true);
  vi.spyOn(session.vault, "decrypt").mockResolvedValueOnce("wrong challenge");
  await expect(
    session.unlock(await createBrowserRecoveryKeyFile(), scope),
  ).rejects.toMatchObject({ problem: "authentication-failed" });
  expect(session.vault.state.status).toBe("locked");
  expect(session.capability()).toBeNull();
});

it("does not let an older failed challenge revoke a newer successful unlock", async () => {
  const session = new RecoverySession(() => true);
  const olderFile = await createBrowserRecoveryKeyFile();
  const newerFile = await createBrowserRecoveryKeyFile();
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let rejectOlder!: (error: Error) => void;
  const held = new Promise<string>((_resolve, reject) => {
    rejectOlder = reject;
  });
  vi.spyOn(session.vault, "encrypt").mockImplementationOnce(() => {
    entered();
    return held;
  });
  const failure = new Error("synthetic older challenge failure");
  const older = expect(session.unlock(olderFile, scope)).rejects.toBe(failure);
  await started;
  await session.unlock(newerFile, scope);
  const capability = session.capability();
  const keyId = session.snapshot().keyId;
  rejectOlder(failure);
  await older;

  expect(session.snapshot().status).toBe("unlocked");
  expect(session.snapshot().keyId).toBe(keyId);
  expect(session.capability()).toBe(capability);
  expect(session.owns(capability)).toBe(true);
  await expect(
    session.vault.encrypt("newer key remains usable", context),
  ).resolves.toBeTypeOf("string");
  session.lock();
});

it.each(["denied", "throws"] as const)(
  "revokes an earlier handle when renewed admission %s",
  async (mode) => {
    let rejectAdmission = false;
    const session = new RecoverySession(() => {
      if (!rejectAdmission) return true;
      if (mode === "throws") throw new Error("synthetic admission failure");
      return false;
    });
    const file = await createBrowserRecoveryKeyFile();
    await session.unlock(file, scope);
    rejectAdmission = true;
    await expect(session.unlock(file, scope)).rejects.toBeInstanceOf(Error);
    expect(session.snapshot().status).toBe("locked");
    expect(session.snapshot().keyId).toBeNull();
    expect(session.capability()).toBeNull();
    expect(session.vault.state.status).toBe("locked");
  },
);

it("drops a pending challenge handle immediately when the document expires", async () => {
  const session = new RecoverySession(() => true);
  const encrypt = session.vault.encrypt.bind(session.vault);
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(session.vault, "encrypt").mockImplementationOnce(async (...args) => {
    const encrypted = await encrypt(...args);
    entered();
    await held;
    return encrypted;
  });
  const attempt = session.unlock(await createBrowserRecoveryKeyFile(), scope);
  const rejected = expect(attempt).rejects.toMatchObject({
    problem: "key-required",
  });
  await started;
  expect(session.snapshot().status).toBe("locked");
  expect(session.vault.state.status).toBe("unlocked");
  session.end("expired");
  expect(session.vault.state.status).toBe("locked");
  expect(session.capability()).toBeNull();
  release();
  await rejected;
  expect(session.snapshot().keyId).toBeNull();
});
