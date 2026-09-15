import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RECORD_CREATED_EVENT,
  RECORD_SAVED_EVENT,
} from "./editorial-inventory-events";
import {
  INVENTORY_CHANNEL,
  startEditorialInventoryRelay,
} from "./editorial-inventory-relay";
import { recoveryLogoutKey } from "./draft-recovery";

/** Same-origin tabs sharing one in-memory channel, delivered synchronously. */
class MemoryChannel {
  static open = new Set<MemoryChannel>();
  static posted: unknown[] = [];
  private listeners = new Set<(event: MessageEvent) => void>();
  closed = false;
  constructor(readonly name: string) {
    MemoryChannel.open.add(this);
  }
  postMessage(data: unknown) {
    if (this.closed) throw new Error("closed");
    MemoryChannel.posted.push(data);
    for (const peer of MemoryChannel.open)
      if (peer !== this && peer.name === this.name)
        for (const listener of peer.listeners)
          listener(
            new MessageEvent("message", { data: structuredClone(data) }),
          );
  }
  addEventListener(_type: "message", listener: (event: MessageEvent) => void) {
    this.listeners.add(listener);
  }
  removeEventListener(
    _type: "message",
    listener: (event: MessageEvent) => void,
  ) {
    this.listeners.delete(listener);
  }
  close() {
    this.closed = true;
    MemoryChannel.open.delete(this);
  }
}

const saved = {
  record: { kind: "writing" as const, id: "post" },
  title: "Saved elsewhere",
  summary: "Summary",
  revision: 7,
  updatedAt: "2026-09-12T01:00:00Z",
  changesPending: true,
};

describe("editorial inventory relay", () => {
  beforeEach(() => {
    MemoryChannel.open.clear();
    MemoryChannel.posted = [];
    vi.stubGlobal("BroadcastChannel", MemoryChannel);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("carries a saved event to another tab once, without echoing it back", () => {
    const tabA = new EventTarget() as Window;
    const tabB = new EventTarget() as Window;
    const stopA = startEditorialInventoryRelay(tabA);
    const stopB = startEditorialInventoryRelay(tabB);
    const seenA = vi.fn();
    const seenB = vi.fn();
    tabA.addEventListener(RECORD_SAVED_EVENT, seenA);
    tabB.addEventListener(RECORD_SAVED_EVENT, seenB);
    tabA.dispatchEvent(new CustomEvent(RECORD_SAVED_EVENT, { detail: saved }));
    expect(seenA).toHaveBeenCalledOnce();
    expect(seenB).toHaveBeenCalledOnce();
    expect((seenB.mock.calls[0]![0] as CustomEvent).detail).toEqual({
      ...saved,
      updatedAt: "2026-09-12T01:00:00.000Z",
    });
    expect(MemoryChannel.posted).toHaveLength(1);
    expect([...MemoryChannel.open].map((channel) => channel.name)).toEqual([
      INVENTORY_CHANNEL,
      INVENTORY_CHANNEL,
    ]);
    stopA();
    stopB();
  });

  it("drops malformed messages and never forwards raw source", () => {
    const tabA = new EventTarget() as Window;
    const tabB = new EventTarget() as Window;
    startEditorialInventoryRelay(tabA);
    startEditorialInventoryRelay(tabB);
    const seenB = vi.fn();
    tabB.addEventListener(RECORD_SAVED_EVENT, seenB);
    tabB.addEventListener(RECORD_CREATED_EVENT, seenB);
    tabA.dispatchEvent(
      new CustomEvent(RECORD_SAVED_EVENT, { detail: { source: "secret" } }),
    );
    tabA.dispatchEvent(
      new CustomEvent(RECORD_SAVED_EVENT, {
        detail: { ...saved, source: "---\ntitle: private\n---" },
      }),
    );
    expect(JSON.stringify(MemoryChannel.posted)).not.toContain("private");
    const peer = new MemoryChannel(INVENTORY_CHANNEL);
    peer.postMessage({ type: "created", detail: { record: { kind: "work" } } });
    peer.postMessage({ type: "unknown", detail: saved });
    peer.postMessage("not an object");
    expect(seenB).toHaveBeenCalledOnce();
  });

  it("closes the channel on sign out in this tab or another", () => {
    const tab = new EventTarget() as Window;
    startEditorialInventoryRelay(tab);
    const [channel] = [...MemoryChannel.open];
    tab.dispatchEvent(
      Object.assign(new Event("storage"), { key: "unrelated" }),
    );
    expect(channel!.closed).toBe(false);
    tab.dispatchEvent(
      Object.assign(new Event("storage"), { key: recoveryLogoutKey }),
    );
    expect(channel!.closed).toBe(true);
    const other = new EventTarget() as Window;
    startEditorialInventoryRelay(other);
    const [second] = [...MemoryChannel.open];
    other.dispatchEvent(new Event(recoveryLogoutKey));
    expect(second!.closed).toBe(true);
    const seen = vi.fn();
    other.addEventListener(RECORD_SAVED_EVENT, seen);
    new MemoryChannel(INVENTORY_CHANNEL).postMessage({
      type: "saved",
      detail: saved,
    });
    expect(seen).not.toHaveBeenCalled();
  });

  it("does nothing where BroadcastChannel is unavailable", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const stop = startEditorialInventoryRelay(new EventTarget() as Window);
    expect(() => stop()).not.toThrow();
  });
});
