import { afterEach, expect, it, vi } from "vitest";
import {
  clearEditorialRecovery,
  readRecovery,
  recoveryKey,
  recoveryLogoutKey,
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
it("clears only editorial recovery and signals logout to this tab and other tabs", () => {
  const local = storage();
  const dispatchEvent = vi.fn();
  vi.stubGlobal("window", { dispatchEvent });
  local.setItem(
    recoveryKey("owner", { kind: "writing", id: "one" }),
    "private",
  );
  local.setItem("theme", "dark");
  clearEditorialRecovery(local);
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
