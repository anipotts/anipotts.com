// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  BrowserRecovery,
  recoveryLogoutGenerationKey,
  type RecoveryLock,
} from "./browser-recovery";
import { RecoverySession } from "./browser-recovery-session";
import { createBrowserRecoveryKeyFile } from "./browser-recovery-encryption";
import {
  encryptRecoveryBundle,
  decryptRecoveryBundle,
} from "./browser-recovery-bundle";
import { EncryptedBrowserRecovery } from "./encrypted-browser-recovery";
import {
  recoveryKey,
  validateRecovery,
  clearEditorialRecovery,
} from "./draft-recovery";

const key = recoveryKey("synthetic@example.test", {
  kind: "writing",
  id: "test",
});
const payload = {
  source: "\uFEFFsynthetic café 🌱\r\n",
  saved: "prior\r\n",
  revision: 7,
  pending: {
    source: "retry\r\n",
    expectedRevision: 6,
    requestId: "11111111-1111-4111-8111-111111111111",
  },
};
function mutex(): RecoveryLock {
  let queue: Promise<unknown> = Promise.resolve();
  return (task) => {
    const next = queue.then(task, task);
    queue = next;
    return next;
  };
}
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: (_name: string, _options: unknown, task: () => unknown) =>
        Promise.resolve().then(task),
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function fixture(admitted = () => true) {
  const session = new RecoverySession(admitted);
  const file = await createBrowserRecoveryKeyFile();
  await session.unlock(file, "synthetic@example.test");
  const lock = mutex();
  const channel = () =>
    new EncryptedBrowserRecovery(
      localStorage,
      key,
      "draft",
      validateRecovery,
      session,
      lock,
    );
  return { session, file, channel };
}
it("adopts legacy exact bytes additively, encrypts retry identity, and keeps tombstones from resurrecting the same legacy copy", async () => {
  localStorage.setItem(key, JSON.stringify(payload));
  const { session, channel } = await fixture();
  const current = channel();
  expect(await current.read()).toEqual({ status: "ready", value: payload });
  expect(await current.write(payload)).toBeNull();
  const encrypted = localStorage.getItem(current.key)!;
  expect(encrypted).not.toContain(payload.pending.requestId);
  expect(localStorage.getItem(key)).toBe(JSON.stringify(payload));
  expect(await channel().read()).toEqual({ status: "ready", value: payload });
  expect(await current.write(null)).toBeNull();
  expect(await channel().read()).toEqual({ status: "missing" });
  localStorage.setItem(
    key,
    JSON.stringify({ ...payload, source: "older tab continued" }),
  );
  const changed = await channel().read();
  expect(changed.status).toBe("changed");
  if (changed.status === "changed")
    expect(changed.candidates?.[0]?.value.source).toBe("older tab continued");
  session.lock();
});
it("refuses stale CAS writes, preserves both candidates and archives the exact displaced ciphertext on explicit choice", async () => {
  const { channel, session } = await fixture();
  const first = channel(),
    second = channel();
  await first.read();
  await second.read();
  expect(await first.write(payload)).toBeNull();
  const original = localStorage.getItem(first.key);
  expect(await second.write({ ...payload, source: "my other copy" })).toBe(
    "changed",
  );
  const contested = second.current();
  expect(contested.status).toBe("changed");
  if (contested.status === "changed")
    expect(
      contested.candidates?.map((candidate) => candidate.value.source),
    ).toEqual(["my other copy", payload.source]);
  expect(localStorage.getItem(first.key)).toBe(original);
  expect(
    await second.choose({ ...payload, source: "my other copy" }),
  ).toBeNull();
  const archive = Object.keys(localStorage).find((name) =>
    name.startsWith(`${first.key}:archive:`),
  );
  expect(localStorage.getItem(archive!)).toBe(original);
  session.lock();
});
it("keeps corrupt/unsupported and foreign-key bytes untouched and encrypts every opaque copy with current edits in export", async () => {
  const { channel, session } = await fixture();
  const current = channel();
  localStorage.setItem(current.key, "{opaque unsupported ciphertext");
  localStorage.setItem(key, "{opaque old plaintext\r\n");
  const other = await fixture();
  const foreign = other.channel();
  localStorage.setItem(foreign.key, "{unavailable old-key bytes");
  expect((await current.read()).status).toBe("corrupt");
  expect(await current.write(payload)).toBe("corrupt");
  const before = { ...localStorage };
  const exported = await current.export(payload);
  expect(exported).not.toContain("opaque old plaintext");
  const opened = JSON.parse(
    await decryptRecoveryBundle(session.vault, exported, current.context),
  );
  expect(opened.currentCopy.payload).toEqual(payload);
  expect(opened.entries).toEqual(before);
  expect({ ...localStorage }).toEqual(before);
  session.lock();
  other.session.lock();
});
it("rejects an old tab changing predecessor bytes while native encryption awaits", async () => {
  const { channel, session } = await fixture();
  const current = channel();
  await current.read();
  const operation = current.write(payload);
  // Let the queue enter hash/encryption work, then synchronously emulate v1.
  await Promise.resolve();
  localStorage.setItem(
    key,
    JSON.stringify({ ...payload, source: "old tab wins" }),
  );
  expect(await operation).toBe("changed");
  expect(localStorage.getItem(current.key)).toBeNull();
  session.lock();
});
it("seals synchronously captured expiry input after the form closes, then drops the key", async () => {
  let admitted = true;
  const { session, channel, file } = await fixture(() => admitted);
  const current = channel();
  await current.read();
  let captured = false;
  session.capture(() => {
    captured = true;
    return current.sealFinal(payload);
  });
  const ended = new Promise<void>((resolve) =>
    session.subscribe(() => {
      if (session.snapshot().status === "locked") resolve();
    }),
  );
  admitted = false;
  session.end("expired");
  expect(captured).toBe(true);
  expect(session.snapshot().status).toBe("closing");
  current.close();
  await ended;
  expect(session.vault.state.status).toBe("locked");
  const next = new RecoverySession(() => true);
  await next.unlock(file, "synthetic@example.test");
  const recovered = new EncryptedBrowserRecovery(
    localStorage,
    key,
    "draft",
    validateRecovery,
    next,
    mutex(),
  );
  expect(await recovered.read()).toEqual({ status: "ready", value: payload });
  next.lock();
});
it("drops keys immediately for pagehide/logout and cannot complete a late native write", async () => {
  const { session, channel } = await fixture();
  const current = channel();
  await current.read();
  const pending = current.write(payload);
  session.end("locked", true);
  expect(session.snapshot().status).toBe("locked");
  expect(await pending).toBe("signed-out");
  expect(localStorage.getItem(current.key)).toBeNull();
});
it("bounds expiry drain and does not retain a key for a stalled capture", async () => {
  const { session } = await fixture();
  vi.useFakeTimers();
  session.capture(() => new Promise(() => {}));
  session.end("expired");
  await vi.advanceTimersByTimeAsync(1500);
  expect(session.vault.state.status).toBe("locked");
});
it.each([false, true])(
  "permanently revokes existing channels after a %s same-key re-import",
  async (same) => {
    const { session, channel, file } = await fixture();
    const current = channel();
    await current.read();
    await current.write(payload);
    const before = localStorage.getItem(current.key);
    session.lock();
    await session.unlock(
      same ? file : await createBrowserRecoveryKeyFile(),
      "synthetic@example.test",
    );
    expect(await current.write({ ...payload, source: "stale work" })).toBe(
      "signed-out",
    );
    expect(await current.sealFinal(payload)).toBe("signed-out");
    await expect(current.export(payload)).rejects.toThrow();
    expect(localStorage.getItem(current.key)).toBe(before);
    session.lock();
  },
);
it("never re-admits queued final work after drain timeout and another unlock", async () => {
  const { session, channel, file } = await fixture();
  const current = channel();
  await current.read();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const gate: RecoveryLock = async (task) => {
    await blocked;
    return task();
  };
  const delayed = new EncryptedBrowserRecovery(
    localStorage,
    key,
    "draft",
    validateRecovery,
    session,
    gate,
  );
  const reading = delayed.read();
  release();
  await reading;
  // Block the write queue using a fresh unresolved native-lock adapter.
  let admit!: () => void;
  const pause = new Promise<void>((resolve) => {
    admit = resolve;
  });
  let hold = false;
  const controlled: RecoveryLock = async (task) => {
    if (hold) await pause;
    return task();
  };
  const final = new EncryptedBrowserRecovery(
    localStorage,
    key,
    "draft",
    validateRecovery,
    session,
    controlled,
  );
  await final.read();
  hold = true;
  let pending!: Promise<unknown>;
  session.capture(() => {
    pending = final.sealFinal(payload);
    return pending;
  });
  vi.useFakeTimers();
  session.end("expired");
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(1500);
  vi.useRealTimers();
  await session.unlock(file, "synthetic@example.test");
  admit();
  expect(await pending).toBe("signed-out");
  expect(localStorage.getItem(final.key)).toBeNull();
  session.lock();
});
it("explicit logout clears v1/v2/v3 and opaque archives without decrypting or changing acknowledged server state", async () => {
  const { session, channel } = await fixture();
  localStorage.setItem(key, JSON.stringify(payload));
  const old = new BrowserRecovery(
    localStorage,
    key,
    "draft",
    validateRecovery,
    mutex(),
  );
  old.read();
  await old.write(payload);
  const current = channel();
  await current.read();
  await current.write(payload);
  localStorage.setItem(
    `${current.key}:archive:${crypto.randomUUID()}`,
    "unknown bytes",
  );
  expect(await clearEditorialRecovery(localStorage)).toBe(true);
  expect(Object.keys(localStorage)).toEqual([recoveryLogoutGenerationKey]);
  expect(await current.write(payload)).toBe("signed-out");
  session.lock();
});
it("chunks oversized opaque export strings exactly and rejects missing/reordered/corrupted chunks", async () => {
  const { session, channel } = await fixture();
  const context = channel().context;
  const raw = "opaque \ud800 雨\r\n".repeat(10000);
  const sealed = await encryptRecoveryBundle(session.vault, raw, context);
  expect(JSON.parse(sealed).chunks.length).toBeGreaterThan(1);
  expect(await decryptRecoveryBundle(session.vault, sealed, context)).toBe(raw);
  for (const alter of [
    (value: any) => value.chunks.pop(),
    (value: any) => value.chunks.reverse(),
    (value: any) => {
      value.chunks[0] += "!";
    },
  ]) {
    const changed = JSON.parse(sealed);
    alter(changed);
    await expect(
      decryptRecoveryBundle(session.vault, JSON.stringify(changed), context),
    ).rejects.toThrow();
  }
  session.lock();
});
