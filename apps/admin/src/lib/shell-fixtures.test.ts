import { afterEach, describe, expect, it, vi } from "vitest";
import sample from "../fixtures/ops_v1.sample.json";
import synthetic from "../fixtures/ops_events_v1.synthetic.json";

const { files, readFile } = vi.hoisted(() => {
  const files = new Map<string, string>();
  const readFile = async (file: URL) => {
    const name = file.pathname.split("/").at(-1)!;
    if (!file.pathname.includes("/.local/replay/")) throw new Error("path");
    const text = files.get(name);
    if (text === undefined)
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    return text;
  };
  return { files, readFile };
});
vi.mock("node:fs/promises", () => ({ readFile }));

const { loadShellFixtures } = await import("./shell-fixtures");
const load = (query = "") =>
  loadShellFixtures(new URL(`http://127.0.0.1/observability/status${query}`));

afterEach(() => files.clear());

describe("development fixtures", () => {
  it("serves the committed samples without a replay", async () => {
    const fixtures = await load();
    expect(fixtures?.snapshot).toEqual(sample);
    expect(fixtures?.events).toEqual(synthetic);
    expect(fixtures?.replay).toBe(false);
  });

  it("serves each replay file present in .local/replay instead", async () => {
    const replay = { version: "ops_v1", replay: true };
    files.set("ops_v1.json", JSON.stringify(replay));
    const fixtures = await load();
    expect(fixtures?.snapshot).toEqual(replay);
    expect(fixtures?.events).toEqual(synthetic);
    expect(fixtures?.replay).toBe(true);
    const events = { version: "ops_events_v1", items: [], next_after: null };
    files.set("ops_events_v1.json", JSON.stringify(events));
    expect((await load())?.events).toEqual(events);
  });

  it("serves a captured sources reply in place of the synthetic sources", async () => {
    const items = [
      {
        source_id: "replayed",
        first_observed_at: null,
        last_observed_at: null,
        record_count: 0,
        revision_count: 0,
      },
    ];
    files.set(
      "data_sources_v1.json",
      JSON.stringify({ data: { items, total: 1, next_offset: null } }),
    );
    const fixtures = await load();
    expect(fixtures?.data.sources).toEqual(items);
    expect(fixtures?.data.records.length).toBeGreaterThan(0);
    expect(fixtures?.replay).toBe(true);
    files.set("data_sources_v1.json", JSON.stringify({ items }));
    await expect(load()).rejects.toThrow("not a /v1/data/sources reply");
  });

  it("keeps the samples on ?fixture=synthetic and nothing on none", async () => {
    files.set("ops_v1.json", "{}");
    expect((await load("?fixture=synthetic"))?.snapshot).toEqual(sample);
    expect(await load("?fixture=none")).toBeUndefined();
  });

  it("fails loudly on a malformed replay rather than falling back", async () => {
    files.set("ops_events_v1.json", "{not json");
    await expect(load()).rejects.toThrow(SyntaxError);
  });
});
