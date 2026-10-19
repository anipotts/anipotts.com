// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  BrowserRecovery,
  recoveryLogoutGenerationKey,
  type RecoveryLock,
} from "./browser-recovery";
import { RecoverySession } from "./browser-recovery-session";
import {
  createBrowserRecoveryKeyFile,
  RecoveryEncryptionError,
} from "./browser-recovery-encryption";
import {
  encryptRecoveryBundle,
  decryptRecoveryBundle,
  recoveryStringHash,
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
it("retains each just-displaced ciphertext when new archive UUIDs sort first, with bounded choices and exact export", async () => {
  const { channel, session } = await fixture();
  const current = channel();
  await current.read();
  await current.writeDurable(payload);
  for (let index = 0; index < 3; index++) {
    const archive = `${current.key}:archive:ffffffff-ffff-4fff-8fff-${String(index).padStart(12, "0")}`;
    localStorage.setItem(archive, localStorage.getItem(current.key)!);
    await current.writeDurable({
      ...payload,
      source: `earlier choice ${index}`,
    });
  }
  const foreign = `${current.key.replace(session.snapshot().keyId!, "f".repeat(64))}:archive:ffffffff-ffff-4fff-8fff-999999999999`;
  localStorage.setItem(foreign, "opaque foreign-key archive");
  // Both bundle ids and archive ids stay unique, while each next archive sorts
  // before every existing one. This does not rely on UUID call counts.
  let uuid = 900_000_000_000;
  vi.spyOn(crypto, "randomUUID").mockImplementation(
    () => `00000000-0000-4000-8000-${uuid--}`,
  );
  const archives = () =>
    Object.keys(localStorage).filter((name) =>
      name.startsWith(`${current.key}:archive:`),
    );
  for (let index = 0; index < 5; index++) {
    const before = archives();
    expect(before).toHaveLength(3);
    const displaced = localStorage.getItem(current.key)!;
    const chosen = { ...payload, source: `chosen exact 雨 ${index}\r\n` };
    expect(await current.choose(chosen)).toBeNull();
    const after = archives();
    const added = after.filter((name) => !before.includes(name));
    expect(after).toHaveLength(3);
    expect(added).toHaveLength(1);
    expect(added[0]).toBe([...after].sort()[0]);
    expect(localStorage.getItem(added[0]!)).toBe(displaced);
    expect(localStorage.getItem(foreign)).toBe("opaque foreign-key archive");
    expect(await channel().read()).toEqual({ status: "ready", value: chosen });
    const exported = JSON.parse(
      await decryptRecoveryBundle(
        session.vault,
        await current.export(chosen),
        current.context,
      ),
    );
    expect(exported.entries).toEqual({ ...localStorage });
    expect(exported.entries[added[0]!]).toBe(displaced);
    expect(exported.currentCopy.payload).toEqual(chosen);
  }
  session.lock();
});
it("reports unavailable without Web Locks while keeping the valid key and encrypted safety export usable", async () => {
  const { session } = await fixture();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: undefined,
  });
  const current = new EncryptedBrowserRecovery(
    localStorage,
    key,
    "draft",
    validateRecovery,
    session,
  );
  expect(await current.read()).toEqual({ status: "unavailable" });
  expect(await current.write(payload)).toBe("unavailable");
  expect(await current.writeDurable(payload)).toBe("unavailable");
  expect(await current.choose(payload)).toBe("unavailable");
  expect(await current.write(null)).toBe("unavailable");
  expect(session.snapshot().status).toBe("unlocked");
  expect(
    JSON.parse(
      await decryptRecoveryBundle(
        session.vault,
        await current.export(payload),
        current.context,
      ),
    ).currentCopy.payload,
  ).toEqual(payload);
  expect(await expireIntoCapture(session, current, payload)).toBe(
    "unavailable",
  );
  expect(session.snapshot().status).toBe("locked");
  expect(Object.keys(localStorage)).toEqual([]);
});
it.each(["closed", "locked", "reimported"] as const)(
  "does not mask a %s channel as missing Web Locks",
  async (state) => {
    const { session, file } = await fixture();
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: undefined,
    });
    const current = new EncryptedBrowserRecovery(
      localStorage,
      key,
      "draft",
      validateRecovery,
      session,
    );
    expect(await current.read()).toEqual({ status: "unavailable" });
    if (state === "closed") current.close();
    else {
      session.lock();
      if (state === "reimported")
        await session.unlock(file, "synthetic@example.test");
    }
    expect(await current.read()).toEqual({ status: "signed-out" });
    expect(await current.write(payload)).toBe("signed-out");
    expect(await current.writeDurable(payload)).toBe("signed-out");
    expect(await current.choose(payload)).toBe("signed-out");
    expect(await current.write(null)).toBe("signed-out");
    expect(await current.sealFinal(payload)).toBe("signed-out");
    if (state === "reimported")
      expect(await expireIntoCapture(session, current, payload)).toBe(
        "signed-out",
      );
    expect(Object.keys(localStorage)).toEqual([]);
    session.lock();
  },
);
it("reclaims a failed choice archive under quota and retries without losing the exact source or other archives", async () => {
  const { channel, session } = await fixture();
  const current = channel();
  await current.read();
  await current.writeDurable(payload);
  const original = localStorage.getItem(current.key)!;
  const priorArchive = `${current.key}:archive:${crypto.randomUUID()}`;
  const foreignArchive = `editorial-recovery:v3:${JSON.stringify(["foreign@example.test", "writing", "test", "b".repeat(64)])}:archive:${crypto.randomUUID()}`;
  localStorage.setItem(priorArchive, "opaque earlier archive");
  localStorage.setItem(foreignArchive, "opaque foreign archive");
  const before = { ...localStorage };
  const storageBytes = () =>
    Object.values(localStorage).reduce(
      (total, value) => total + value.length,
      0,
    );
  // The archive fits, but replacing the source with a larger ciphertext does
  // not. Use real encrypted storage, with only the browser quota simulated.
  let capacity = storageBytes() + original.length;
  const nativeSet = Storage.prototype.setItem;
  const acceptedArchives: string[] = [];
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    name,
    raw,
  ) {
    const nextBytes =
      storageBytes() - (this.getItem(name)?.length ?? 0) + raw.length;
    if (nextBytes > capacity)
      throw new DOMException("synthetic quota", "QuotaExceededError");
    nativeSet.call(this, name, raw);
    if (name.startsWith(`${current.key}:archive:`)) acceptedArchives.push(name);
  });
  const chosen = { ...payload, source: "larger chosen copy ".repeat(300) };
  expect(await current.choose(chosen)).toBe("unavailable");
  expect(acceptedArchives).toHaveLength(1);
  expect({ ...localStorage }).toEqual(before);
  expect(storageBytes()).toBe(capacity - original.length);
  expect(await channel().read()).toEqual({ status: "ready", value: payload });
  capacity += 100_000;
  expect(await current.choose(chosen)).toBeNull();
  expect(await channel().read()).toEqual({ status: "ready", value: chosen });
  expect(localStorage.getItem(acceptedArchives[0]!)).toBeNull();
  expect(localStorage.getItem(acceptedArchives[1]!)).toBe(original);
  expect(localStorage.getItem(priorArchive)).toBe(before[priorArchive]);
  expect(localStorage.getItem(foreignArchive)).toBe(before[foreignArchive]);
  session.lock();
});
it("preserves a failed choice archive if its exact bytes changed before rollback", async () => {
  const { channel, session } = await fixture();
  const current = channel();
  await current.read();
  await current.writeDurable(payload);
  const original = localStorage.getItem(current.key);
  const nativeSet = Storage.prototype.setItem;
  let archive = "";
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    name,
    raw,
  ) {
    if (name === current.key) {
      nativeSet.call(this, archive, "external replacement bytes");
      throw new DOMException("synthetic quota", "QuotaExceededError");
    }
    nativeSet.call(this, name, raw);
    if (name.startsWith(`${current.key}:archive:`)) archive = name;
  });
  expect(await current.choose({ ...payload, source: "chosen copy" })).toBe(
    "unavailable",
  );
  expect(localStorage.getItem(current.key)).toBe(original);
  expect(localStorage.getItem(archive)).toBe("external replacement bytes");
  expect(await channel().read()).toEqual({ status: "ready", value: payload });
  session.lock();
});
it.each(["read", "remove"] as const)(
  "keeps the original failure and source when archive rollback %s fails",
  async (failure) => {
    const { channel, session } = await fixture();
    const current = channel();
    await current.read();
    await current.writeDurable(payload);
    const original = localStorage.getItem(current.key);
    const nativeSet = Storage.prototype.setItem;
    const nativeGet = Storage.prototype.getItem;
    const nativeRemove = Storage.prototype.removeItem;
    let archive = "";
    let failed = false;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      name,
      raw,
    ) {
      if (name === current.key) {
        failed = true;
        throw new DOMException("synthetic quota", "QuotaExceededError");
      }
      nativeSet.call(this, name, raw);
      if (name.startsWith(`${current.key}:archive:`)) archive = name;
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
      this: Storage,
      name,
    ) {
      if (failed && failure === "read" && name === archive)
        throw new SyntaxError("synthetic cleanup read refusal");
      return nativeGet.call(this, name);
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (
      this: Storage,
      name,
    ) {
      if (failed && failure === "remove" && name === archive)
        throw new SyntaxError("synthetic cleanup remove refusal");
      return nativeRemove.call(this, name);
    });
    expect(await current.choose({ ...payload, source: "chosen copy" })).toBe(
      "unavailable",
    );
    expect(nativeGet.call(localStorage, current.key)).toBe(original);
    expect(nativeGet.call(localStorage, archive)).toBe(original);
    expect(await channel().read()).toEqual({ status: "ready", value: payload });
    session.lock();
  },
);
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

async function heldWriter() {
  const fixtureState = await fixture();
  let release!: () => void;
  const pause = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = false;
  let entered = 0;
  const lock: RecoveryLock = async (task) => {
    entered++;
    if (held) await pause;
    return task();
  };
  const current = new EncryptedBrowserRecovery(
    localStorage,
    key,
    "draft",
    validateRecovery,
    fixtureState.session,
    lock,
  );
  await current.read();
  held = true;
  return { ...fixtureState, current, release, entered: () => entered };
}

it("coalesces 24 large native snapshots into one active plus the latest pending without acknowledging superseded durability", async () => {
  const { current, channel, session, release, entered } = await heldWriter();
  const writes = vi.spyOn(Storage.prototype, "setItem");
  const large = {
    ...payload,
    saved: "s".repeat(196608),
    source: "x".repeat(196608),
  };
  let pending = 0;
  const operations = Array.from({ length: 24 }, (_, index) => {
    const captured = { ...large, source: `${index}:${large.source}` };
    pending++;
    const operation = current.write(captured).finally(() => {
      pending--;
    });
    captured.source = captured.saved = "discard caller reference";
    return operation;
  });
  // Superseded promises settle before the native lock is released. They retain
  // no pending payload or success acknowledgment; only first/latest may persist.
  expect(await Promise.all(operations.slice(1, -1))).toEqual(
    Array(22).fill("superseded"),
  );
  expect(pending).toBe(2);
  expect(entered()).toBe(2); // initial read plus exactly one active write
  expect(writes).not.toHaveBeenCalled();
  release();
  expect(await operations[0]).toBeNull();
  expect(await operations.at(-1)).toBeNull();
  expect(pending).toBe(0);
  expect(entered()).toBe(3);
  expect(
    writes.mock.calls.filter(([name]) => name === current.key),
  ).toHaveLength(2);
  expect(await channel().read()).toEqual({
    status: "ready",
    value: { ...large, source: `23:${large.source}` },
  });
  session.lock();
});

it("orders bounded durable identities, tombstones and explicit archival before newer replaceable input", async () => {
  const { current, session, release } = await heldWriter();
  const stored: string[] = [];
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    name,
    raw,
  ) {
    if (name === current.key) stored.push(raw);
    return original.call(this, name, raw);
  });
  const copy = (source: string) => ({ ...payload, source });
  const first = current.write(copy("active"));
  const olderInput = current.write(copy("replace before identity"));
  const identity = current.writeDurable(copy("creation identity"));
  const beforeSave = current.write(copy("replace before tombstone"));
  const acknowledged = current.write(null);
  const identityAfterSave = current.writeDurable(copy("retry after save"));
  const chosen = current.choose(copy("explicit choice"));
  const latest = current.write(copy("latest after barriers"));
  expect(await current.writeDurable(copy("excess barrier"))).toBe(
    "unavailable",
  );
  expect(await olderInput).toBe("superseded");
  expect(await beforeSave).toBe("superseded");
  expect(stored).toEqual([]);
  release();
  expect(
    await Promise.all([
      first,
      identity,
      acknowledged,
      identityAfterSave,
      chosen,
      latest,
    ]),
  ).toEqual(Array(6).fill(null));
  const outcomes = [];
  for (const raw of stored) {
    const decoded = JSON.parse(
      await decryptRecoveryBundle(session.vault, raw, current.context),
    );
    outcomes.push(decoded.payload?.source ?? null);
  }
  expect(outcomes).toEqual([
    "active",
    "creation identity",
    null,
    "retry after save",
    "explicit choice",
    "latest after barriers",
  ]);
  const archive = Object.keys(localStorage).find((name) =>
    name.startsWith(`${current.key}:archive:`),
  );
  expect(localStorage.getItem(archive!)).toBe(stored[3]);
  session.lock();
});

it("expiry discards pending normal input and barriers and seals only the closing capture after in-flight work", async () => {
  const { current, session, file, release } = await heldWriter();
  const writes = vi.spyOn(Storage.prototype, "setItem");
  const active = current.write({ ...payload, source: "obsolete active" });
  const barrier = current.writeDurable({
    ...payload,
    source: "obsolete queued identity",
  });
  const latest = current.write({
    ...payload,
    source: "obsolete pending input",
  });
  let final!: Promise<unknown>;
  session.capture(() => {
    final = current.sealFinal(payload);
    return final;
  });
  const ended = new Promise<void>((resolve) =>
    session.subscribe(() => {
      if (session.snapshot().status === "locked") resolve();
    }),
  );
  session.end("expired");
  current.close();
  expect(await barrier).toBe("signed-out");
  expect(await latest).toBe("signed-out");
  release();
  expect(await active).toBe("signed-out");
  expect(await final).toBeNull();
  await ended;
  expect(
    writes.mock.calls.filter(([name]) => name === current.key),
  ).toHaveLength(1);
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

it("maps usage exhaustion distinctly, preserves ciphertext and refuses encrypted exports without bypassing admission", async () => {
  const { channel, session } = await fixture();
  // Inject only the native exhaustion outcome; keep the prior stored bundle and
  // subsequent decryption real, without 65536 expensive native encryptions.
  const writer = channel();
  await writer.read();
  expect(await writer.write(payload)).toBeNull();
  const before = localStorage.getItem(writer.key);
  const encrypt = vi
    .spyOn(session.vault, "encrypt")
    .mockRejectedValue(new RecoveryEncryptionError("key-usage-limit"));
  expect(
    await writer.write({ ...payload, source: "still in this document" }),
  ).toBe("key-usage-limit");
  expect(localStorage.getItem(writer.key)).toBe(before);
  await expect(writer.export(payload)).rejects.toMatchObject({
    problem: "key-usage-limit",
  });
  encrypt.mockRestore();
  expect(await channel().read()).toEqual({ status: "ready", value: payload });
  session.lock();
  expect(await writer.write(payload)).toBe("signed-out");
  await expect(writer.export(payload)).rejects.toMatchObject({
    problem: "stale",
  });
});

async function expireIntoCapture<T>(
  session: RecoverySession,
  current: EncryptedBrowserRecovery<T>,
  value: T,
) {
  let final!: Promise<unknown>;
  const stop = session.capture(() => {
    final = current.sealFinal(value);
    return final;
  });
  const ended = new Promise<void>((resolve) =>
    session.subscribe(() => {
      if (session.snapshot().status === "locked") resolve();
    }),
  );
  session.end("expired");
  current.close();
  await ended;
  stop();
  return final;
}

async function threeCaptures() {
  const setup = await fixture();
  const writer = setup.channel();
  await writer.read();
  await writer.writeDurable(payload);
  const predecessors = await recoveryStringHash(JSON.stringify([null, null]));
  for (let index = 0; index < 3; index++) {
    const raw = await encryptRecoveryBundle(
      setup.session.vault,
      JSON.stringify({
        kind: "draft",
        payload: { ...payload, source: `authenticated ended ${index}` },
        predecessors,
      }),
      writer.context,
    );
    localStorage.setItem(`${writer.key}:capture:${crypto.randomUUID()}`, raw);
  }
  writer.close();
  const current = setup.channel();
  expect((await current.read()).status).toBe("changed");
  const olderKey = Object.keys(localStorage)
    .filter((name) => name.startsWith(`${current.key}:capture:`))
    .sort()[0]!;
  return { ...setup, current, olderKey };
}

it.each(["append", "validation", "older-read", "older-remove"] as const)(
  "preserves readable recovery after a transient capture %s failure and can retry",
  async (failure) => {
    const { session, file, channel, current, olderKey } = await threeCaptures();
    const foreign = `${current.key.replace(session.snapshot().keyId!, "f".repeat(64))}:capture:${crypto.randomUUID()}`;
    localStorage.setItem(foreign, "foreign opaque capture");
    const before = { ...localStorage };
    const nativeSet = Storage.prototype.setItem,
      nativeGet = Storage.prototype.getItem,
      nativeRemove = Storage.prototype.removeItem;
    let inserted = false,
      failed = false;
    const fail = () => {
      failed = true;
      throw new DOMException(
        "synthetic transient capture refusal",
        "SecurityError",
      );
    };
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      name,
      raw,
    ) {
      if (name.startsWith(`${current.key}:capture:`)) {
        if (failure === "append") fail();
        nativeSet.call(this, name, raw);
        inserted = true;
      } else nativeSet.call(this, name, raw);
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
      this: Storage,
      name,
    ) {
      if (
        inserted &&
        !failed &&
        ((failure === "validation" && name === recoveryLogoutGenerationKey) ||
          (failure === "older-read" && name === olderKey))
      )
        fail();
      return nativeGet.call(this, name);
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (
      this: Storage,
      name,
    ) {
      if (
        inserted &&
        !failed &&
        failure === "older-remove" &&
        name === olderKey
      )
        fail();
      nativeRemove.call(this, name);
    });
    expect(
      await expireIntoCapture(session, current, {
        ...payload,
        source: "failed ended copy",
      }),
    ).toBe("unavailable");
    expect(failed).toBe(true);
    expect({ ...localStorage }).toEqual(before);
    vi.restoreAllMocks();
    await session.unlock(file, "synthetic@example.test");
    const retry = channel();
    const restored = await retry.read();
    expect(restored.status).toBe("changed");
    if (restored.status === "changed")
      expect(restored.candidates).toHaveLength(4);
    expect(
      await expireIntoCapture(session, retry, {
        ...payload,
        source: "retry ended copy",
      }),
    ).toBeNull();
    expect(
      Object.keys(localStorage).filter((name) =>
        name.startsWith(`${retry.key}:capture:`),
      ),
    ).toHaveLength(3);
    expect(localStorage.getItem(current.key)).toBe(before[current.key]);
    expect(localStorage.getItem(foreign)).toBe(before[foreign]);
    await session.unlock(file, "synthetic@example.test");
    const reopened = await channel().read();
    expect(reopened.status).toBe("changed");
    if (reopened.status === "changed")
      expect(
        reopened.candidates?.some(
          ({ value }) => value.source === "retry ended copy",
        ),
      ).toBe(true);
    session.lock();
  },
);

it.each([false, true])(
  "refuses a changed older capture without deleting unknown bytes (new capture changed=%s)",
  async (newChanged) => {
    const { session, file, channel, current, olderKey } = await threeCaptures();
    const before = { ...localStorage };
    const nativeSet = Storage.prototype.setItem;
    let added = "";
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      name,
      raw,
    ) {
      nativeSet.call(this, name, raw);
      if (name.startsWith(`${current.key}:capture:`)) {
        added = name;
        nativeSet.call(this, olderKey, "changed older opaque bytes");
        if (newChanged) nativeSet.call(this, name, "changed new opaque bytes");
      }
    });
    expect(await expireIntoCapture(session, current, payload)).toBe(
      newChanged ? "unavailable" : "changed",
    );
    vi.restoreAllMocks();
    const expected = { ...before, [olderKey]: "changed older opaque bytes" };
    if (newChanged) expected[added] = "changed new opaque bytes";
    expect({ ...localStorage }).toEqual(expected);
    await session.unlock(file, "synthetic@example.test");
    const reader = channel();
    expect((await reader.read()).status).toBe(
      newChanged ? "oversized" : "corrupt",
    );
    const exported = JSON.parse(
      await decryptRecoveryBundle(
        session.vault,
        await reader.export(payload),
        reader.context,
      ),
    );
    expect(exported.entries).toEqual(expected);
    session.lock();
  },
);

it.each(["new-changed", "cleanup-read", "cleanup-remove"] as const)(
  "retains opaque bytes without pruning older copies when capture rollback cannot complete: %s",
  async (failure) => {
    const { session, file, channel, current, olderKey } = await threeCaptures();
    const before = { ...localStorage };
    const nativeSet = Storage.prototype.setItem,
      nativeGet = Storage.prototype.getItem,
      nativeRemove = Storage.prototype.removeItem;
    let added = "",
      failed = false;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      name,
      raw,
    ) {
      nativeSet.call(this, name, raw);
      if (name.startsWith(`${current.key}:capture:`)) {
        added = name;
        if (failure === "new-changed")
          nativeSet.call(this, name, "changed new opaque bytes");
      }
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
      this: Storage,
      name,
    ) {
      if (failed && failure === "cleanup-read" && name === added)
        throw new SyntaxError("synthetic rollback read refusal");
      return nativeGet.call(this, name);
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (
      this: Storage,
      name,
    ) {
      if (name === olderKey && failure !== "new-changed") {
        failed = true;
        throw new DOMException("synthetic pruning refusal", "SecurityError");
      }
      if (failed && failure === "cleanup-remove" && name === added)
        throw new SyntaxError("synthetic rollback remove refusal");
      nativeRemove.call(this, name);
    });
    expect(await expireIntoCapture(session, current, payload)).toBe(
      "unavailable",
    );
    vi.restoreAllMocks();
    const expected = { ...before, [added]: localStorage.getItem(added)! };
    expect({ ...localStorage }).toEqual(expected);
    expect(
      Object.keys(expected).filter((name) =>
        name.startsWith(`${current.key}:capture:`),
      ),
    ).toHaveLength(4);
    await session.unlock(file, "synthetic@example.test");
    const reader = channel();
    expect(await reader.read()).toEqual({ status: "oversized" });
    const exported = JSON.parse(
      await decryptRecoveryBundle(
        session.vault,
        await reader.export(payload),
        reader.context,
      ),
    );
    expect(exported.entries).toEqual(expected);
    session.lock();
  },
);

it("seals contested expiry separately and discovers exact canonical/ended copies after unlock, with explicit acknowledgment and no tombstone resurrection", async () => {
  localStorage.setItem(key, JSON.stringify(payload));
  const { session, file, channel } = await fixture();
  const first = channel(),
    second = channel();
  await first.read();
  await second.read();
  const theirs = { ...payload, source: "competing canonical 雨\r\n" };
  const mine = {
    ...payload,
    source: "ended current café\r\n",
    pending: { ...payload.pending, source: "exact ended retry" },
  };
  expect(await first.write(theirs)).toBeNull();
  expect(await second.write(mine)).toBe("changed");
  const canonical = localStorage.getItem(first.key);
  const legacy = localStorage.getItem(key);
  expect(await expireIntoCapture(session, second, mine)).toBeNull();
  const captureKey = Object.keys(localStorage).find((name) =>
    name.startsWith(`${first.key}:capture:`),
  )!;
  const capture = localStorage.getItem(captureKey)!;
  expect(capture).not.toContain(mine.source);
  expect(capture).not.toContain(mine.pending.source);
  expect(localStorage.getItem(first.key)).toBe(canonical);
  expect(localStorage.getItem(key)).toBe(legacy);
  const next = new RecoverySession(() => true);
  await next.unlock(file, "synthetic@example.test");
  const reopen = () =>
    new EncryptedBrowserRecovery(
      localStorage,
      key,
      "draft",
      validateRecovery,
      next,
      mutex(),
    );
  const reader = reopen();
  const offered = await reader.read();
  expect(offered.status).toBe("changed");
  if (offered.status === "changed")
    expect(offered.candidates?.map((copy) => copy.value)).toEqual([
      theirs,
      mine,
    ]);
  expect(await reader.choose(mine)).toBeNull();
  expect(localStorage.getItem(captureKey)).toBe(capture);
  const archive = Object.keys(localStorage).find((name) =>
    name.startsWith(`${reader.key}:archive:`),
  )!;
  expect(localStorage.getItem(archive)).toBe(canonical);
  expect(await reopen().read()).toEqual({ status: "ready", value: mine });
  expect(await reader.write(null)).toBeNull();
  expect(await reopen().read()).toEqual({ status: "missing" });
  // Acknowledgment binds exact bytes, so a changed capture is offered again.
  const replacement = { ...mine, source: "a separately changed ended copy" };
  localStorage.setItem(
    captureKey,
    await encryptRecoveryBundle(
      next.vault,
      JSON.stringify({
        kind: "draft",
        payload: replacement,
        predecessors: "a".repeat(64),
      }),
      reader.context,
    ),
  );
  const changed = await reopen().read();
  expect(changed.status).toBe("changed");
  if (changed.status === "changed")
    expect(changed.candidates?.map((copy) => copy.value)).toEqual([
      replacement,
    ]);
  next.lock();
});

it("bounds supported ended captures to three, keeps the newly sealed copy and foreign keys, and preserves unexpected opaque fourth bytes", async () => {
  const setup = await fixture();
  const file = setup.file;
  setup.session.lock();
  const foreign =
    'editorial-recovery:v3:["synthetic@example.test","writing","test","' +
    "f".repeat(64) +
    '"]:capture:11111111-1111-4111-8111-111111111111';
  localStorage.setItem(foreign, "foreign opaque bytes");
  let canonicalKey = "";
  for (let index = 0; index < 4; index++) {
    const session = new RecoverySession(() => true);
    await session.unlock(file, "synthetic@example.test");
    const channel = () =>
      new EncryptedBrowserRecovery(
        localStorage,
        key,
        "draft",
        validateRecovery,
        session,
        mutex(),
      );
    const current = channel();
    await current.read();
    // Legacy changes are uncoordinated old-tab behavior and force a true CAS loss.
    localStorage.setItem(
      key,
      JSON.stringify({ ...payload, source: `old tab ${index}` }),
    );
    expect(await current.write({ ...payload, source: `ended ${index}` })).toBe(
      "changed",
    );
    const canonical = localStorage.getItem(current.key);
    const before = Object.keys(localStorage)
      .filter((name) => name.startsWith(`${current.key}:capture:`))
      .sort();
    expect(
      await expireIntoCapture(session, current, {
        ...payload,
        source: `ended ${index}`,
      }),
    ).toBeNull();
    canonicalKey = current.key;
    const after = Object.keys(localStorage)
      .filter((name) => name.startsWith(`${current.key}:capture:`))
      .sort();
    expect(after).toHaveLength(Math.min(index + 1, 3));
    expect(after.some((name) => !before.includes(name))).toBe(true);
    if (index === 3) expect(after).not.toContain(before[0]);
    expect(localStorage.getItem(current.key)).toBe(canonical);
    expect(localStorage.getItem(foreign)).toBe("foreign opaque bytes");
  }
  const session = new RecoverySession(() => true);
  await session.unlock(file, "synthetic@example.test");
  const unexpected = `${canonicalKey}:capture:${crypto.randomUUID()}`;
  localStorage.setItem(unexpected, "unknown fourth bytes");
  const before = { ...localStorage };
  const current = new EncryptedBrowserRecovery(
    localStorage,
    key,
    "draft",
    validateRecovery,
    session,
    mutex(),
  );
  expect(await current.read()).toEqual({ status: "oversized" });
  expect(await expireIntoCapture(session, current, payload)).toBe("oversized");
  expect({ ...localStorage }).toEqual(before);
});

it("capture inventory changes defeat explicit choice CAS and keep unknown capture bytes exportable", async () => {
  const { session, channel } = await fixture();
  const current = channel();
  await current.read();
  await current.write(payload);
  const captureKey = `${current.key}:capture:${crypto.randomUUID()}`;
  const before = localStorage.getItem(current.key);
  localStorage.setItem(captureKey, "opaque unreadable capture");
  expect(await current.choose(payload)).toBe("corrupt");
  expect(localStorage.getItem(current.key)).toBe(before);
  expect((await channel().read()).status).toBe("corrupt");
  const exported = JSON.parse(
    await decryptRecoveryBundle(
      session.vault,
      await current.export(payload),
      current.context,
    ),
  );
  expect(exported.entries[captureKey]).toBe("opaque unreadable capture");
  session.lock();
});

it("normalizes capture keys for exact record export and explicit logout cleanup", async () => {
  const { encryptedRecoveryLegacyKey } =
    await import("./encrypted-browser-recovery");
  const { session, channel } = await fixture();
  const current = channel();
  await current.read();
  await current.write(payload);
  const captureKey = `${current.key}:capture:${crypto.randomUUID()}`;
  localStorage.setItem(captureKey, "opaque current capture");
  expect(encryptedRecoveryLegacyKey(captureKey)).toBe(key);
  expect(await clearEditorialRecovery(localStorage)).toBe(true);
  expect(localStorage.getItem(captureKey)).toBeNull();
  expect(Object.keys(localStorage)).toEqual([recoveryLogoutGenerationKey]);
  session.lock();
});

it("maps constructor and revoked storage admission to unavailable without rejecting write barriers or changing bytes", async () => {
  const { session, channel } = await fixture();
  const current = channel();
  await current.read();
  await current.write(payload);
  const originalGet = Storage.prototype.getItem;
  const original = localStorage.getItem(current.key);
  const denial = vi
    .spyOn(Storage.prototype, "getItem")
    .mockImplementation(() => {
      throw new DOMException("synthetic revoked storage", "SecurityError");
    });
  let fresh!: ReturnType<typeof channel>;
  expect(() => {
    fresh = channel();
  }).not.toThrow();
  expect(await fresh.read()).toEqual({ status: "unavailable" });
  for (const candidate of [current, fresh]) {
    expect(await candidate.write(payload)).toBe("unavailable");
    expect(await candidate.writeDurable(payload)).toBe("unavailable");
    expect(await candidate.write(null)).toBe("unavailable");
    expect(await candidate.choose(payload)).toBe("unavailable");
    await expect(candidate.export(payload)).rejects.toMatchObject({
      problem: "unavailable",
    });
  }
  let final!: Promise<unknown>;
  session.capture(() => {
    final = fresh.sealFinal(payload);
    return final;
  });
  session.end("expired");
  expect(await final).toBe("unavailable");
  await session.settled();
  expect(originalGet.call(localStorage, current.key)).toBe(original);
  denial.mockRestore();
  session.lock();
});

it("drains pending work with unavailable after storage revocation and does not strand subsequent admission failures", async () => {
  const { current, session, release } = await heldWriter();
  const first = current.write(payload);
  const queued = current.writeDurable({
    ...payload,
    source: "queued identity",
  });
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("synthetic revoked storage", "SecurityError");
  });
  expect(await current.writeDurable(payload)).toBe("unavailable");
  release();
  expect(await first).toBe("unavailable");
  expect(await queued).toBe("unavailable");
  await session.settled();
  session.lock();
});

it("does not append or prune when capture inventory changes during native final encryption", async () => {
  const { session, channel } = await fixture();
  const current = channel();
  await current.read();
  localStorage.setItem(key, JSON.stringify(payload));
  expect(await current.write(payload)).toBe("changed");
  const canonical = localStorage.getItem(current.key);
  const injectedKey = `${current.key}:capture:${crypto.randomUUID()}`;
  const native = session.vault.encrypt.bind(session.vault);
  let injected = false;
  vi.spyOn(session.vault, "encrypt").mockImplementation(async (...args) => {
    const encrypted = await native(...args);
    if (!injected) {
      injected = true;
      localStorage.setItem(injectedKey, "racing opaque bytes");
    }
    return encrypted;
  });
  expect(await expireIntoCapture(session, current, payload)).toBe("changed");
  expect(localStorage.getItem(injectedKey)).toBe("racing opaque bytes");
  expect(localStorage.getItem(current.key)).toBe(canonical);
  expect(
    Object.keys(localStorage).filter((name) =>
      name.startsWith(`${current.key}:capture:`),
    ),
  ).toEqual([injectedKey]);
});

it("a contested final capture cannot append after its 1500 ms cutoff or a later same-key unlock", async () => {
  const { session, file } = await fixture();
  let held = false;
  let release!: () => void;
  const pause = new Promise<void>((resolve) => {
    release = resolve;
  });
  const lock: RecoveryLock = async (task) => {
    if (held) await pause;
    return task();
  };
  const current = new EncryptedBrowserRecovery(
    localStorage,
    key,
    "draft",
    validateRecovery,
    session,
    lock,
  );
  await current.read();
  localStorage.setItem(key, JSON.stringify(payload));
  expect(await current.write(payload)).toBe("changed");
  const before = { ...localStorage };
  held = true;
  let pending!: Promise<unknown>;
  session.capture(() => {
    pending = current.sealFinal(payload);
    return pending;
  });
  vi.useFakeTimers();
  session.end("expired");
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(1500);
  vi.useRealTimers();
  await session.unlock(file, "synthetic@example.test");
  release();
  expect(await pending).toBe("signed-out");
  expect({ ...localStorage }).toEqual(before);
  session.lock();
});

it("preserves unsupported encrypted capture bytes without acknowledging or pruning them", async () => {
  const { session, channel } = await fixture();
  const current = channel();
  await current.read();
  await current.write(payload);
  const captureKey = `${current.key}:capture:${crypto.randomUUID()}`;
  const raw = await encryptRecoveryBundle(
    session.vault,
    JSON.stringify({
      kind: "draft",
      payload,
      predecessors: "a".repeat(64),
      future: true,
    }),
    current.context,
  );
  localStorage.setItem(captureKey, raw);
  expect((await channel().read()).status).toBe("unsupported");
  const before = { ...localStorage };
  expect(await current.choose(payload)).toBe("unsupported");
  expect({ ...localStorage }).toEqual(before);
  const exported = JSON.parse(
    await decryptRecoveryBundle(
      session.vault,
      await current.export(payload),
      current.context,
    ),
  );
  expect(exported.entries[captureKey]).toBe(raw);
  session.lock();
});

it.each(["canonical", "legacy"] as const)(
  "offers a valid ended capture alongside opaque %s bytes and archives only an explicit canonical replacement",
  async (location) => {
    const { session, channel } = await fixture();
    const reader = channel();
    const opaque = "{opaque original bytes";
    const opaqueKey = location === "canonical" ? reader.key : key;
    localStorage.setItem(opaqueKey, opaque);
    const captureKey = `${reader.key}:capture:${crypto.randomUUID()}`;
    const raw = await encryptRecoveryBundle(
      session.vault,
      JSON.stringify({ kind: "draft", payload, predecessors: "a".repeat(64) }),
      reader.context,
    );
    localStorage.setItem(captureKey, raw);
    const offered = await reader.read();
    expect(offered.status).toBe("changed");
    if (offered.status === "changed")
      expect(offered.candidates?.map((copy) => copy.value)).toEqual([payload]);
    expect(await reader.choose(payload)).toBeNull();
    expect(localStorage.getItem(captureKey)).toBe(raw);
    if (location === "legacy") expect(localStorage.getItem(key)).toBe(opaque);
    else
      expect(
        Object.keys(localStorage).some(
          (name) =>
            name.startsWith(`${reader.key}:archive:`) &&
            localStorage.getItem(name) === opaque,
        ),
      ).toBe(true);
    expect(await channel().read()).toEqual({ status: "ready", value: payload });
    session.lock();
  },
);
