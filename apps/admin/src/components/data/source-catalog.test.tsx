// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import type { DataResult } from "../../data/personal-context";
import type { DataReader } from "../../lib/data-read-session";
import { useSourceNamesState, type SourceNamesState } from "./source-catalog";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const ready = (id: string): DataResult => ({
  state: "ready",
  scope: "owner",
  observedAt: "2026-10-04T00:00:00Z",
  data: { items: [{ source_id: id, display_name: id }], next_offset: null },
});

describe("reader-scoped source catalog readiness", () => {
  it("never renders a previous reader's names while the next reader resolves", async () => {
    let finish!: (value: DataResult) => void;
    const first: DataReader = async () => ready("first-source");
    const second: DataReader = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const seen: SourceNamesState[] = [];
    function Probe({ reader }: { reader: DataReader | null }) {
      const state = useSourceNamesState(reader);
      seen.push(state);
      return <output>{state.status}</output>;
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<Probe reader={first} />));
    expect(seen.at(-1)?.names.has("first-source")).toBe(true);
    seen.length = 0;
    await act(async () => root.render(<Probe reader={second} />));
    expect(
      seen.every(
        (state) => state.status === "pending" && state.names.size === 0,
      ),
    ).toBe(true);
    await act(async () => root.render(<Probe reader={null} />));
    await act(async () => finish(ready("second-source")));
    expect(seen.at(-1)?.status).toBe("off");
    expect(seen.at(-1)?.names.size).toBe(0);
    await act(async () => root.unmount());
  });

  it("settles a bounded catalog as incomplete rather than loading forever", async () => {
    let calls = 0;
    const reader: DataReader = async () => {
      calls++;
      return {
        state: "ready",
        scope: "owner",
        observedAt: "2026-10-04T00:00:00Z",
        data: { items: [{ source_id: `source-${calls}` }], next_offset: calls },
      };
    };
    let latest!: SourceNamesState;
    function Probe() {
      latest = useSourceNamesState(reader);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe />));
    expect(calls).toBe(10);
    expect(latest.status).toBe("incomplete");
    expect(latest.names.size).toBe(10);
    await act(async () => root.unmount());
  });

  it("settles a failed catalog and retries for a later consumer", async () => {
    let reads = 0;
    const reader: DataReader = async () =>
      ++reads === 1
        ? { state: "unavailable", message: "synthetic failure" }
        : ready("recovered-source");
    let latest!: SourceNamesState;
    function Probe() {
      latest = useSourceNamesState(reader);
      return null;
    }
    const first = createRoot(document.createElement("div"));
    await act(async () => first.render(<Probe />));
    expect(latest.status).toBe("failed");
    await act(async () => first.unmount());
    const second = createRoot(document.createElement("div"));
    await act(async () => second.render(<Probe />));
    expect(latest.status).toBe("ready");
    expect(latest.names.has("recovered-source")).toBe(true);
    await act(async () => second.unmount());
  });
});
