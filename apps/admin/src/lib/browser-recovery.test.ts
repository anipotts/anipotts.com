import { expect, it } from "vitest";
import { MAX_SOURCE_BYTES } from "@anipotts/content/editorial/source";
import {
  BrowserRecovery,
  type RecoveryLock,
  versionedRecoveryKey,
  recoveryLogoutGenerationKey,
} from "./browser-recovery";
import {
  recoveryKey,
  validateRecovery,
  validateNewWritingRecovery,
} from "./draft-recovery";

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
function mutex(): RecoveryLock {
  let previous: Promise<unknown> = Promise.resolve();
  return (task) => {
    const result = previous.then(task, task);
    previous = result;
    return result;
  };
}
const key = recoveryKey("synthetic-owner", { kind: "writing", id: "example" });
const snapshot = {
  source: "---\r\ntitle: 雨 ☔\r\n---\r\nexact e\u0301 text\r\n",
  saved: "base\r\n",
  revision: 7,
  pending: {
    source: "older\r\nrequest",
    expectedRevision: 6,
    requestId: "11111111-1111-4111-8111-111111111111",
  },
};
function channel(local: Storage, lock = mutex()) {
  return new BrowserRecovery(local, key, "draft", validateRecovery, lock);
}

it("reads legacy exact bytes and pending identity without any write, then writes v2 without touching legacy", async () => {
  const local = storage();
  const raw = JSON.stringify(snapshot);
  local.setItem(key, raw);
  const recovery = channel(local);
  expect(recovery.read()).toEqual({ status: "ready", value: snapshot });
  expect(local.getItem(versionedRecoveryKey(key))).toBeNull();
  expect(await recovery.write(snapshot)).toBeNull();
  expect(local.getItem(key)).toBe(raw);
  expect(channel(local).read()).toEqual({ status: "ready", value: snapshot });
});
it("retains a legacy acknowledgment tombstone without resurrecting an old draft", async () => {
  const local = storage();
  local.setItem(key, JSON.stringify(snapshot));
  const recovery = channel(local);
  recovery.read();
  await recovery.write(null);
  expect(channel(local).read()).toEqual({ status: "missing" });
  expect(local.getItem(key)).toBe(JSON.stringify(snapshot));
});
it("old writers and new writers coexist without silent adoption or overwrite", async () => {
  const local = storage();
  const recovery = channel(local);
  local.setItem(key, JSON.stringify(snapshot));
  recovery.read();
  await recovery.write(snapshot);
  const v2 = local.getItem(versionedRecoveryKey(key));
  const oldTab = { ...snapshot, source: "Different old tab 雨\r\n" };
  local.setItem(key, JSON.stringify(oldTab));
  expect(await recovery.write({ ...snapshot, source: "new edit" })).toBe(
    "changed",
  );
  expect(local.getItem(versionedRecoveryKey(key))).toBe(v2);
  const reopened = channel(local);
  expect(reopened.read()).toEqual({
    status: "changed",
    candidates: [
      { label: "Current browser copy", value: snapshot },
      { label: "Older tab copy", value: oldTab },
    ],
  });
  expect(await reopened.write(snapshot)).toBe("changed");
  expect(await reopened.choose(oldTab)).toBeNull();
  expect(channel(local).read()).toEqual({ status: "ready", value: oldTab });
  const exported = JSON.parse(reopened.export()).entries;
  expect(Object.values(exported)).toContain(v2);
  expect(exported[key]).toBe(JSON.stringify(oldTab));
});
it("serializes supported tabs and refuses a stale writer after another tab advances", async () => {
  const local = storage();
  const lock = mutex();
  const a = channel(local, lock),
    b = channel(local, lock);
  a.read();
  b.read();
  const results = await Promise.all([
    a.write(snapshot),
    b.write({ ...snapshot, source: "B" }),
  ]);
  expect(results).toEqual([null, "changed"]);
  expect(channel(local).read()).toEqual({ status: "ready", value: snapshot });
  expect(await b.write(null)).toBe("changed");
});
it("preserves unsupported and corrupt data exactly, including exports, and forbids writes", async () => {
  for (const [raw, status] of [
    ["{", "corrupt"],
    [
      JSON.stringify({
        format: "anipotts.browser-recovery",
        version: 99,
        kind: "draft",
        payload: snapshot,
        legacyRaw: null,
      }),
      "unsupported",
    ],
  ] as const) {
    const local = storage();
    local.setItem(versionedRecoveryKey(key), raw);
    const recovery = channel(local);
    expect(recovery.read().status).toBe(status);
    expect(await recovery.write(snapshot)).toBe(status);
    expect(await recovery.choose(snapshot)).toBe(status);
    expect(
      JSON.parse(recovery.export()).entries[versionedRecoveryKey(key)],
    ).toBe(raw);
  }
});
it("enforces UTF-8 source and pending limits without normalizing valid text", () => {
  expect(
    validateRecovery({
      ...snapshot,
      source: "雨".repeat(Math.floor(MAX_SOURCE_BYTES / 3)),
    }),
  ).not.toBeNull();
  expect(
    validateRecovery({
      ...snapshot,
      source: "雨".repeat(Math.floor(MAX_SOURCE_BYTES / 3) + 1),
    }),
  ).toBeNull();
  expect(
    validateRecovery({
      ...snapshot,
      pending: {
        ...snapshot.pending,
        source: "😀".repeat(MAX_SOURCE_BYTES / 4 + 1),
      },
    }),
  ).toBeNull();
  expect(
    validateNewWritingRecovery({
      title: "雨".repeat(3334),
      slug: "valid",
      customSlug: false,
      request: null,
    }),
  ).toBeNull();
});
it("distinguishes missing, inaccessible and oversized storage without erasing it", () => {
  expect(channel(storage()).read().status).toBe("missing");
  const denied = {
    getItem() {
      throw new DOMException("Denied", "SecurityError");
    },
  } as unknown as Storage;
  expect(channel(denied).read().status).toBe("unavailable");
  const local = storage();
  local.setItem(versionedRecoveryKey(key), "x".repeat(MAX_SOURCE_BYTES * 15));
  expect(channel(local).read().status).toBe("oversized");
  expect(local.getItem(versionedRecoveryKey(key))?.length).toBe(
    MAX_SOURCE_BYTES * 15,
  );
});
it("storage quota failure and missing coordination preserve existing bytes", async () => {
  const local = storage();
  local.setItem(key, JSON.stringify(snapshot));
  const noLock = new BrowserRecovery(
    local,
    key,
    "draft",
    validateRecovery,
    null,
  );
  noLock.read();
  expect(await noLock.write(snapshot)).toBe("unavailable");
  const denied = {
    getItem: local.getItem.bind(local),
    setItem() {
      throw new DOMException("Quota", "QuotaExceededError");
    },
  } as unknown as Storage;
  const recovery = channel(denied);
  recovery.read();
  expect(await recovery.write(snapshot)).toBe("unavailable");
  expect(local.getItem(key)).toBe(JSON.stringify(snapshot));
});
it("closing a channel cancels queued recovery writes before logout can be repopulated", async () => {
  const local = storage();
  const recovery = channel(local);
  recovery.read();
  const write = recovery.write(snapshot);
  recovery.close();
  expect(await write).toBe("unavailable");
  expect(local.getItem(versionedRecoveryKey(key))).toBeNull();
});

it("a later old-tab edit remains discoverable after a v2 acknowledgment", async () => {
  const local = storage();
  local.setItem(key, JSON.stringify(snapshot));
  const current = channel(local);
  current.read();
  await current.write(null);
  const newLegacy = {
    ...snapshot,
    source: "Newly authored after acknowledgment",
  };
  local.setItem(key, JSON.stringify(newLegacy));
  expect(channel(local).read()).toEqual({
    status: "changed",
    candidates: [{ label: "Older tab copy", value: newLegacy }],
  });
});
it("denied Web Locks never runs an uncoordinated write", async () => {
  const local = storage();
  local.setItem(key, JSON.stringify(snapshot));
  const denied: RecoveryLock = async () => {
    throw new DOMException("Denied", "SecurityError");
  };
  const recovery = channel(local, denied);
  expect(recovery.read().status).toBe("ready");
  expect(await recovery.write(snapshot)).toBe("unavailable");
  expect(local.getItem(versionedRecoveryKey(key))).toBeNull();
  expect(local.getItem(key)).toBe(JSON.stringify(snapshot));
});

it("an old-tab logout prevents replay while the new tab is closed and misses the event", async () => {
  const local = storage();
  const first = channel(local);
  first.read();
  await first.write(snapshot);
  first.close();
  const raw = local.getItem(versionedRecoveryKey(key));
  // Exact old-v1 behavior: clear v1 keys, then persist a new logout signal.
  local.removeItem(key);
  local.setItem(recoveryLogoutGenerationKey, "old-tab-logout-generation");
  const reopened = channel(local);
  expect(reopened.read()).toEqual({ status: "signed-out" });
  expect(await reopened.write(snapshot)).toBe("signed-out");
  expect(await reopened.choose(snapshot)).toBe("signed-out");
  expect(local.getItem(versionedRecoveryKey(key))).toBe(raw);
  expect(JSON.parse(reopened.export()).entries[versionedRecoveryKey(key)]).toBe(
    raw,
  );
});
it("logout generation is checked under the lock without relying on an event", async () => {
  const local = storage();
  const current = channel(local);
  current.read();
  local.setItem(recoveryLogoutGenerationKey, "later-logout");
  expect(await current.write(snapshot)).toBe("signed-out");
  expect(local.getItem(versionedRecoveryKey(key))).toBeNull();
});
it("ordinary auth expiry does not invent a logout epoch or erase recoverable content", async () => {
  const local = storage();
  local.setItem(recoveryLogoutGenerationKey, "previous-explicit-logout");
  const current = channel(local);
  current.read();
  await current.write(snapshot);
  current.close();
  // Authentication requests may fail, but only explicit logout changes the marker.
  expect(channel(local).read()).toEqual({ status: "ready", value: snapshot });
});
