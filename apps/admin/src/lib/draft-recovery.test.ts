import { afterEach, expect, it, vi } from "vitest";
import {
  clearEditorialRecovery,
  readRecovery,
  recoveryKey,
  recoveryLogoutKey,
  draftRecovery,
} from "./draft-recovery";
import {
  browserRecoveryLock,
  recoveryLifecycleLockName,
  versionedRecoveryKey,
} from "./browser-recovery";

function storage() {
  const values: Record<string, string> = {};
  return new Proxy(values, {
    get(target, key) {
      if (key === "getItem") return (name: string) => target[name] ?? null;
      if (key === "setItem")
        return (name: string, value: string) => {
          target[name] = value;
        };
      if (key === "removeItem")
        return (name: string) => {
          delete target[name];
        };
      return target[String(key)];
    },
  }) as unknown as Storage;
}
afterEach(() => vi.unstubAllGlobals());
it("isolates accounts and records and rejects malformed recovery", () => {
  const local = storage();
  const record = { kind: "writing", id: "article" };
  const key = recoveryKey("owner", record);
  expect(key).not.toBe(recoveryKey("another", record));
  expect(key).not.toBe(recoveryKey("owner", { ...record, id: "other" }));
  for (const source of [
    '{"source":"broken"}',
    "{",
    '{"source":"text","saved":"base","revision":-1,"pending":null}',
  ]) {
    local.setItem(key, source);
    expect(readRecovery(local, key)).toBeNull();
  }
  const draft = { source: "text", saved: "base", revision: 2, pending: null };
  local.setItem(key, JSON.stringify(draft));
  expect(readRecovery(local, key)).toEqual(draft);
});
it("clears only editorial recovery and signals logout to this tab and other tabs", async () => {
  installLocks();
  const local = storage();
  const dispatchEvent = vi.fn();
  vi.stubGlobal("window", { dispatchEvent });
  local.setItem(
    recoveryKey("owner", { kind: "writing", id: "one" }),
    "private",
  );
  local.setItem("theme", "dark");
  expect(await clearEditorialRecovery(local)).toBe(true);
  expect(
    Object.keys(local).filter((key) =>
      key.startsWith("editorial-recovery:v1:"),
    ),
  ).toEqual([]);
  expect(local.getItem("theme")).toBe("dark");
  expect(local.getItem(recoveryLogoutKey)).toBeTruthy();
  expect(dispatchEvent).toHaveBeenCalledOnce();
});

it("scopes creation recovery, preserves valid retry identity, and rejects unrelated identities", async () => {
  const { newWritingRecoveryKey, readNewWritingRecovery } =
    await import("./draft-recovery");
  const local = storage();
  const key = newWritingRecoveryKey("owner");
  expect(key).not.toBe(newWritingRecoveryKey("another"));
  expect(key).not.toBe(recoveryKey("owner", { kind: "writing", id: "new" }));
  const request = {
    key: JSON.stringify(["Title", "title"]),
    id: "11111111-1111-4111-8111-111111111111",
  };
  local.setItem(
    key,
    JSON.stringify({
      title: "Title",
      slug: "title",
      customSlug: true,
      request,
    }),
  );
  expect(readNewWritingRecovery(local, key)).toEqual({
    title: "Title",
    slug: "title",
    customSlug: true,
    request,
  });
  local.setItem(
    key,
    JSON.stringify({ title: "New title", slug: "new", request }),
  );
  expect(readNewWritingRecovery(local, key)?.request).toBeNull();
  local.setItem(key, "{");
  expect(readNewWritingRecovery(local, key)).toBeNull();
});

it("treats denied browser storage as unavailable for both recovery readers", async () => {
  const { readNewWritingRecovery } = await import("./draft-recovery");
  const denied = {
    getItem() {
      throw new Error("Storage disabled");
    },
  } as unknown as Storage;
  expect(readRecovery(denied, "key")).toBeNull();
  expect(readNewWritingRecovery(denied, "key")).toBeNull();
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
/** Faithful shared/exclusive admission, FIFO with abortable pending requests. */
function installLocks() {
  type Pending = {
    shared: boolean;
    run: () => void;
    abort: () => void;
    signal?: AbortSignal;
  };
  const queues = new Map<
    string,
    { active: number; exclusive: boolean; pending: Pending[] }
  >();
  const names: string[] = [];
  const request = (name: string, options: LockOptions, task: () => unknown) => {
    names.push(name);
    let queue = queues.get(name);
    if (!queue) {
      queue = { active: 0, exclusive: false, pending: [] };
      queues.set(name, queue);
    }
    const state = queue;
    const pump = () => {
      while (!state.exclusive && state.pending.length) {
        const next = state.pending[0];
        if (!next.shared && state.active) return;
        state.pending.shift();
        next.signal?.removeEventListener("abort", next.abort);
        if (next.signal?.aborted) {
          next.abort();
          continue;
        }
        state.active++;
        state.exclusive = !next.shared;
        next.run();
      }
    };
    return new Promise((resolve, reject) => {
      const entry: Pending = {
        shared: options.mode === "shared",
        signal: options.signal ?? undefined,
        abort: () => {
          const index = state.pending.indexOf(entry);
          if (index >= 0) state.pending.splice(index, 1);
          reject(options.signal?.reason);
          pump();
        },
        run: () => {
          Promise.resolve()
            .then(task)
            .then(resolve, reject)
            .finally(() => {
              state.active--;
              if (!entry.shared) state.exclusive = false;
              pump();
            });
        },
      };
      state.pending.push(entry);
      options.signal?.addEventListener("abort", entry.abort, { once: true });
      pump();
    });
  };
  vi.stubGlobal("navigator", { locks: { request } });
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  return names;
}

const snapshot = {
  source: "private",
  saved: "base",
  revision: 1,
  pending: null,
};
const recordKey = recoveryKey("synthetic-owner", {
  kind: "writing",
  id: "race",
});

it("waits for an already admitted writer of an absent key and its archive under the exact record lock", async () => {
  const names = installLocks();
  const local = storage();
  const entered = deferred(),
    release = deferred();
  const lock = browserRecoveryLock(recordKey)!;
  const writer = lock(async () => {
    const generation = local.getItem(recoveryLogoutKey);
    entered.resolve();
    await release.promise;
    const raw = JSON.stringify({
      format: "anipotts.browser-recovery",
      version: 2,
      logoutGeneration: generation,
      payload: snapshot,
    });
    local.setItem(versionedRecoveryKey(recordKey), raw);
    local.setItem(
      versionedRecoveryKey(recordKey) +
        ":archive:11111111-1111-4111-8111-111111111111",
      raw,
    );
  });
  await entered.promise;
  let complete = false;
  const clearing = clearEditorialRecovery(local).then((value) => {
    complete = true;
    return value;
  });
  await Promise.resolve();
  expect(complete).toBe(false);
  release.resolve();
  await writer;
  expect(await clearing).toBe(true);
  expect(Object.keys(local)).toEqual([recoveryLogoutKey]);
  expect(names).toContain(recoveryLifecycleLockName);
  expect(
    names.filter((name) => name === `editorial-recovery:${recordKey}`).length,
  ).toBe(2);
});

it("stops queued old-generation channels without deleting a fresh-generation copy", async () => {
  installLocks();
  const local = storage();
  const old = draftRecovery(local, recordKey);
  old.read();
  const entered = deferred(),
    release = deferred();
  const occupied = browserRecoveryLock(recordKey)!(async () => {
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const queued = old.write(snapshot);
  const clearing = clearEditorialRecovery(local);
  const fresh = draftRecovery(local, recordKey);
  fresh.read();
  const freshWrite = fresh.write({ ...snapshot, source: "fresh session" });
  release.resolve();
  await occupied;
  expect(await queued).toBe("signed-out");
  expect(await clearing).toBe(true);
  expect(await freshWrite).toBeNull();
  expect(readRecovery(local, recordKey)?.source).toBe("fresh session");
});

it("preserves fresh-generation copies written before delayed cleanup enters its barrier", async () => {
  installLocks();
  const local = storage();
  const entered = deferred(),
    release = deferred();
  const holder = browserRecoveryLock(recordKey)!(async () => {
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const clearing = clearEditorialRecovery(local);
  const raw = JSON.stringify({
    format: "anipotts.browser-recovery",
    version: 2,
    kind: "draft",
    logoutGeneration: local.getItem(recoveryLogoutKey),
    legacyRaw: null,
    payload: snapshot,
  });
  local.setItem(versionedRecoveryKey(recordKey), raw);
  release.resolve();
  await holder;
  expect(await clearing).toBe(true);
  expect(local.getItem(versionedRecoveryKey(recordKey))).toBe(raw);
});

it("reports failed storage and missing or rejected locks rather than successful cleanup", async () => {
  installLocks();
  const denied = {
    setItem() {
      throw new Error("denied");
    },
  } as unknown as Storage;
  expect(await clearEditorialRecovery(denied)).toBe(false);
  const local = storage();
  local.setItem(recordKey, "private");
  vi.stubGlobal("navigator", {});
  expect(await clearEditorialRecovery(local)).toBe(false);
  vi.stubGlobal("navigator", {
    locks: {
      request: async () => {
        throw new Error("timeout");
      },
    },
  });
  expect(await clearEditorialRecovery(local)).toBe(false);
  expect(local.getItem(recordKey)).toBe("private");
});

it("reports incomplete cleanup if storage removal fails or another logout interrupts it", async () => {
  installLocks();
  const local = storage();
  local.setItem(recordKey, "private");
  const failing = new Proxy(local, {
    get(target, name) {
      return name === "removeItem"
        ? () => {
            throw new Error("denied");
          }
        : Reflect.get(target, name);
    },
  });
  expect(await clearEditorialRecovery(failing)).toBe(false);
  expect(local.getItem(recordKey)).toBe("private");
  const entered = deferred(),
    release = deferred();
  const holder = browserRecoveryLock(recordKey)!(async () => {
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const clearing = clearEditorialRecovery(local);
  local.setItem(recoveryLogoutKey, "superseding logout");
  release.resolve();
  await holder;
  expect(await clearing).toBe(false);
});
