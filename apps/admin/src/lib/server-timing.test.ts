import { describe, expect, it } from "vitest";
import {
  SERVER_TIMING_METRICS,
  applyServerTiming,
  createServerTiming,
  measureServerTiming,
  serverTimingD1,
  startServerTiming,
} from "./server-timing";

const PRIVATE_TEXT = [
  "SELECT",
  "admin_knowledge_cards",
  "private-record-id",
  "owner@example.test",
  "/content/writing/private-record-id",
];

/** Every entry is an allowlisted name with exactly one numeric dur or desc. */
function parse(header: string) {
  return header.split(", ").map((entry) => {
    const match = /^([a-z0-9]+);(dur|desc)=(\d+(?:\.\d)?)$/.exec(entry);
    expect(match, entry).not.toBeNull();
    const [, name, kind, value] = match!;
    expect(Object.keys(SERVER_TIMING_METRICS)).toContain(name);
    expect(kind).toBe(
      SERVER_TIMING_METRICS[name as keyof typeof SERVER_TIMING_METRICS] ===
        "count"
        ? "desc"
        : "dur",
    );
    return { name, kind, value: Number(value) };
  });
}

function clock(...steps: number[]) {
  let index = 0;
  return () => steps[Math.min(index++, steps.length - 1)]!;
}

function fakeDatabase(fail = false) {
  const statement = {
    bind: (..._values: unknown[]) => statement,
    first: async () => {
      if (fail) throw new Error("SELECT private-record-id failed");
      return { id: "private-record-id" };
    },
    all: async () => ({ results: [{ email: "owner@example.test" }] }),
    run: async () => ({ success: true }),
    raw: async () => [["private-record-id"]],
  };
  const batches: unknown[][] = [];
  return {
    batches,
    statement,
    db: {
      prepare: (_sql: string) => statement,
      batch: async (statements: unknown[]) => {
        batches.push(statements);
        return statements.map(() => ({ success: true }));
      },
    },
  };
}

describe("server timing header", () => {
  it("contains only allowlisted names with numeric dur and desc values", async () => {
    const timing = createServerTiming();
    const locals = { serverTiming: timing };
    for (const metric of [
      "inventory",
      "record",
      "newsletter",
      "operations",
      "life",
    ] as const)
      await measureServerTiming(locals, metric, async () => PRIVATE_TEXT);
    const { db } = fakeDatabase();
    const wrapped = serverTimingD1(locals, db);
    await wrapped
      .prepare("SELECT * FROM admin_knowledge_cards WHERE id = ?")
      .bind("private-record-id")
      .all();
    const response = applyServerTiming(
      new Response("rendered"),
      timing,
      12.345,
    );
    const header = response.headers.get("Server-Timing")!;
    const entries = parse(header);
    expect(entries.map((entry) => entry.name).sort()).toEqual(
      Object.keys(SERVER_TIMING_METRICS).sort(),
    );
    expect(entries.find((entry) => entry.name === "app")?.value).toBe(12.3);
    expect(entries.find((entry) => entry.name === "d1q")?.value).toBe(1);
    for (const text of PRIVATE_TEXT) expect(header).not.toContain(text);
  });

  it("adds repeated durations and ignores names outside the allowlist", () => {
    const timing = createServerTiming(clock(0, 5, 10, 12.25));
    timing.start("inventory")();
    const stop = timing.start("inventory");
    stop();
    stop();
    timing.add("private-record-id" as never, 40);
    timing.add("record", Number.NaN);
    timing.add("life", -3);
    expect(parse(timing.header())).toEqual([
      { name: "inventory", kind: "dur", value: 7.3 },
      { name: "record", kind: "dur", value: 0 },
      { name: "life", kind: "dur", value: 0 },
    ]);
  });

  it("omits D1 metrics unless a loader used a database handle", () => {
    const timing = createServerTiming();
    expect(serverTimingD1({ serverTiming: timing }, undefined)).toBeUndefined();
    expect(timing.header()).toBe("");
    serverTimingD1({ serverTiming: timing }, fakeDatabase().db);
    expect(timing.header()).toBe("d1;dur=0, d1q;desc=0");
  });
});

describe("D1 query counter", () => {
  it("counts every query method, batches and failures without changing results", async () => {
    const timing = createServerTiming(clock(0, 1, 1, 3, 3, 4, 4, 6, 6, 7));
    const { db, batches, statement } = fakeDatabase(true);
    const wrapped = timing.database(db);
    const bound = wrapped.prepare("SELECT ?").bind("private-record-id");
    await expect(bound.first!()).rejects.toThrow("failed");
    expect(await bound.all!()).toEqual({
      results: [{ email: "owner@example.test" }],
    });
    expect(await bound.run!()).toEqual({ success: true });
    expect(await bound.raw!()).toEqual([["private-record-id"]]);
    await wrapped.batch!([bound, wrapped.prepare("SELECT 1")]);
    // The real binding receives its own statements, never the counting wrappers.
    expect(batches).toEqual([[statement, statement]]);
    expect(parse(timing.header())).toEqual([
      { name: "d1", kind: "dur", value: 7 },
      { name: "d1q", kind: "desc", value: 6 },
    ]);
  });
});

describe("request helpers", () => {
  it("run loaders unchanged when the request has no collector", async () => {
    await expect(
      measureServerTiming({}, "inventory", async () => "loaded"),
    ).resolves.toBe("loaded");
    await expect(
      measureServerTiming(undefined, "life", () => {
        throw new Error("unavailable");
      }),
    ).rejects.toThrow("unavailable");
    expect(() => startServerTiming(null, "record")()).not.toThrow();
    const { db } = fakeDatabase();
    expect(serverTimingD1({}, db)).toBe(db);
  });

  it("records a failed loader's duration", async () => {
    const timing = createServerTiming(clock(0, 2));
    await expect(
      measureServerTiming({ serverTiming: timing }, "operations", async () => {
        throw new Error("disconnected");
      }),
    ).rejects.toThrow("disconnected");
    expect(timing.header()).toBe("operations;dur=2");
  });

  it("leaves immutable response headers and non-responses alone", () => {
    const timing = createServerTiming();
    const redirect = Response.redirect("https://admin.example.test/", 302);
    expect(applyServerTiming(redirect, timing, 1)).toBe(redirect);
    expect(redirect.headers.get("Server-Timing")).toBeNull();
    expect(applyServerTiming(undefined, createServerTiming(), 1)).toBe(
      undefined,
    );
  });
});
