import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sample from "../fixtures/ops_v1.sample.json";
import { OPS_V1_SAMPLE_PROVENANCE } from "../fixtures/ops_v1.provenance";
import {
  OPS_V1_BOUNDS,
  OPS_V1_STATES,
  OpsSnapshotError,
  formatDuration,
  opsFreshness,
  opsRenderedCounts,
  opsRunbookHref,
  opsServices,
  parseOpsSnapshot,
  parseOpsSnapshotBytes,
} from "./ops-v1";

type Json = Record<string, any>;
const fresh = (): Json => structuredClone(sample) as Json;
const rejects = (value: unknown) =>
  expect(() => parseOpsSnapshot(value)).toThrow(OpsSnapshotError);

describe("ops_v1 fixture", () => {
  it("is a byte-exact copy of System's fixture", () => {
    const bytes = readFileSync(
      new URL("../fixtures/ops_v1.sample.json", import.meta.url),
    );
    const blob = createHash("sha1")
      .update(`blob ${bytes.byteLength}\0`)
      .update(bytes)
      .digest("hex");
    expect(blob).toBe(OPS_V1_SAMPLE_PROVENANCE.blobSha);
  });

  it("parses, keeping catalog order and every status row", () => {
    const snapshot = parseOpsSnapshot(fresh());
    expect(snapshot.version).toBe("ops_v1");
    expect(snapshot.catalog.map((item) => item.id)).toEqual(
      sample.catalog.map((item) => item.id),
    );
    expect(snapshot.status.size).toBe(sample.status.length);
    expect(snapshot.counts).toEqual(sample.counts);
  });

  it("covers every state except asleep, which only ap-pro reports", () => {
    const states = new Set(
      opsServices(parseOpsSnapshot(fresh())).map((item) => item.status.state),
    );
    expect([...states].sort()).toEqual(
      ["degraded", "failing", "ok", "stale", "unknown"].sort(),
    );
  });
});

describe("contract client rules", () => {
  it("accepts unknown ids and unknown groups", () => {
    const value = fresh();
    value.catalog.push({
      ...value.catalog[1],
      id: "zz.new-thing.v2",
      name: "new thing",
      group: "a group admin has never seen",
    });
    value.status.push({ ...value.status[1], id: "zz.new-thing.v2" });
    const services = opsServices(parseOpsSnapshot(value));
    expect(services.at(-1)).toMatchObject({
      id: "zz.new-thing.v2",
      group: "a group admin has never seen",
      missingStatus: false,
    });
  });

  it("treats a missing status row as unknown, never ok", () => {
    const value = fresh();
    value.status = value.status.filter((row: Json) => row.id !== "health.api");
    const services = opsServices(parseOpsSnapshot(value));
    const health = services.find((item) => item.id === "health.api")!;
    expect(health.missingStatus).toBe(true);
    expect(health.status.state).toBe("unknown");
    expect(health.status.last_success_at).toBeNull();
    expect(opsRenderedCounts(services)).toMatchObject({ ok: 7, unknown: 2 });
  });

  it("treats an empty status list as all unknown", () => {
    const value = fresh();
    value.status = [];
    const services = opsServices(parseOpsSnapshot(value));
    expect(services.every((item) => item.status.state === "unknown")).toBe(
      true,
    );
  });

  it.each([
    ["catalog entry", (v: Json) => (v.catalog[0].schedule = "*/5 * * * *")],
    ["catalog entry", (v: Json) => (v.catalog[0].private_note = "x")],
    ["status row", (v: Json) => (v.status[0].message = "private text")],
    ["counts", (v: Json) => (v.counts.sleeping = 0)],
    ["root", (v: Json) => (v.events = [])],
  ])("rejects an unknown field in the %s", (_, mutate) => {
    const value = fresh();
    mutate(value);
    rejects(value);
  });

  it.each([
    ["catalog", (v: Json) => delete v.catalog[0].runbook],
    ["catalog", (v: Json) => delete v.catalog[0].freshness_budget_s],
    ["status", (v: Json) => delete v.status[0].last_exit],
    ["counts", (v: Json) => delete v.counts.asleep],
    ["root", (v: Json) => delete v.generated_at],
  ])("rejects a missing field in %s", (_, mutate) => {
    const value = fresh();
    mutate(value);
    rejects(value);
  });

  it("accepts status as an object keyed by id", () => {
    const value = fresh();
    value.status = Object.fromEntries(
      value.status.map(({ id, ...row }: Json) => [id, row]),
    );
    const snapshot = parseOpsSnapshot(value);
    expect(snapshot.status.get("pc.inference")?.state).toBe("failing");
  });

  it("rejects duplicate ids and status rows outside the catalog", () => {
    const duplicateEntry = fresh();
    duplicateEntry.catalog.push(duplicateEntry.catalog[0]);
    rejects(duplicateEntry);
    const duplicateRow = fresh();
    duplicateRow.status.push(duplicateRow.status[0]);
    rejects(duplicateRow);
    const orphan = fresh();
    orphan.status.push({ ...orphan.status[0], id: "not.in.catalog" });
    rejects(orphan);
  });
});

describe("bounds", () => {
  const entryCase = (field: string, value: unknown) => {
    const v = fresh();
    v.catalog[0][field] = value;
    return v;
  };
  const rowCase = (field: string, value: unknown) => {
    const v = fresh();
    v.status[0][field] = value;
    return v;
  };

  it("enforces the id pattern", () => {
    for (const id of [
      "",
      "Upper.case",
      ".leading-dot",
      "-leading-dash",
      "under_score",
      "a".repeat(65),
      "slash/id",
      7,
    ])
      rejects(entryCase("id", id));
    for (const id of ["a", "0", "a".repeat(64), "a.b-c.9"]) {
      const v = entryCase("id", id);
      v.status[0].id = id;
      expect(() => parseOpsSnapshot(v)).not.toThrow();
    }
  });

  it("rejects kinds, hosts and states outside the contract", () => {
    rejects(entryCase("kind", "daemon"));
    rejects(entryCase("host", "ap-air"));
    rejects(rowCase("state", "healthy"));
    rejects(rowCase("state", "OK"));
  });

  it("bounds text fields", () => {
    rejects(entryCase("name", ""));
    rejects(entryCase("name", "x".repeat(OPS_V1_BOUNDS.nameMax + 1)));
    rejects(entryCase("group", "x".repeat(OPS_V1_BOUNDS.groupMax + 1)));
    rejects(entryCase("owner", "line\nbreak"));
    rejects(entryCase("name", " padded"));
    rejects(rowCase("detail", "x".repeat(OPS_V1_BOUNDS.detailMax + 1)));
    rejects(rowCase("detail", null));
  });

  it("requires an integer budget in range, or null", () => {
    for (const budget of [
      0,
      -1,
      1.5,
      "300",
      OPS_V1_BOUNDS.budgetMaxSeconds + 1,
    ])
      rejects(entryCase("freshness_budget_s", budget));
    expect(() =>
      parseOpsSnapshot(entryCase("freshness_budget_s", null)),
    ).not.toThrow();
  });

  it("requires exact UTC second timestamps no later than the snapshot", () => {
    for (const at of [
      "2026-09-21T17:55:00.000Z",
      "2026-09-21T17:55:00+00:00",
      "2026-09-21 17:55:00Z",
      "2026-02-30T00:00:00Z",
      "2026-09-21T18:00:01Z",
      1_790_000_000,
    ])
      rejects(rowCase("last_success_at", at));
    const bad = fresh();
    bad.generated_at = "2026-09-21T25:00:00Z";
    rejects(bad);
    expect(() =>
      parseOpsSnapshot(rowCase("last_run_at", "2026-09-21T18:00:00Z")),
    ).not.toThrow();
  });

  it("requires an integer exit code in the 32-bit range, or null", () => {
    for (const exit of [1.5, "0", 2 ** 31, -(2 ** 31) - 1])
      rejects(rowCase("last_exit", exit));
    for (const exit of [-9, 0, 78, null])
      expect(() => parseOpsSnapshot(rowCase("last_exit", exit))).not.toThrow();
  });

  it("allows only in-repo paths or https runbooks", () => {
    for (const runbook of [
      "/etc/passwd",
      "../secrets/key",
      "docs/../../x",
      "docs//x",
      "http://example.com/runbook",
      "https://user:pass@example.com/x",
      "javascript:alert(1)",
      "docs/run book.md",
    ])
      rejects(entryCase("runbook", runbook));
    for (const runbook of [
      "docs/runbooks/ops-mini.md",
      "https://developers.cloudflare.com/workers/",
    ])
      expect(() =>
        parseOpsSnapshot(entryCase("runbook", runbook)),
      ).not.toThrow();
  });

  it("rejects the wrong version, non-object roots and oversized lists", () => {
    const version = fresh();
    version.version = "ops_v2";
    rejects(version);
    for (const value of [null, [], "ops_v1", 1]) rejects(value);
    const big = fresh();
    big.catalog = Array.from(
      { length: OPS_V1_BOUNDS.maxEntries + 1 },
      (_, index) => ({ ...big.catalog[1], id: `svc.${index}` }),
    );
    big.status = [];
    rejects(big);
    const negative = fresh();
    negative.counts.ok = -1;
    rejects(negative);
  });

  it("enforces the 64 KB byte cap and strict UTF-8", () => {
    const encoded = new TextEncoder().encode(JSON.stringify(sample));
    expect(parseOpsSnapshotBytes(encoded).catalog).toHaveLength(
      sample.catalog.length,
    );
    const padded = new Uint8Array(OPS_V1_BOUNDS.maxBytes + 1).fill(0x20);
    padded.set(encoded);
    expect(() => parseOpsSnapshotBytes(padded)).toThrow(OpsSnapshotError);
    expect(() => parseOpsSnapshotBytes(new Uint8Array([0xff, 0xfe]))).toThrow(
      OpsSnapshotError,
    );
  });

  it("never echoes rejected input", () => {
    const value = fresh();
    value.status[0].detail = "secret-looking-private-text\n";
    try {
      parseOpsSnapshot(value);
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain("secret");
    }
  });
});

describe("rendering helpers", () => {
  const services = opsServices(parseOpsSnapshot(fresh()));
  const now = Date.parse("2026-09-21T18:00:00Z");

  it("measures last success age against each entry's own budget", () => {
    const writer = services.find((item) => item.id === "pc.writer")!;
    expect(opsFreshness(writer, now)).toEqual({
      kind: "budget",
      ageSeconds: 300,
      budgetSeconds: 4500,
      overBudget: false,
    });
    const chatgpt = services.find((item) => item.id === "keepalive.chatgpt")!;
    expect(opsFreshness(chatgpt, now + 1000)).toMatchObject({
      overBudget: true,
    });
    const health = services.find((item) => item.id === "health.api")!;
    expect(opsFreshness(health, now)).toEqual({
      kind: "liveness",
      ageSeconds: 300,
    });
    const sync = services.find((item) => item.id === "agents.sync")!;
    expect(opsFreshness(sync, now)).toEqual({ kind: "never" });
  });

  it("formats durations compactly", () => {
    expect(
      [45, 300, 4500, 93600, 3 * 86400].map((value) => formatDuration(value)),
    ).toEqual(["45s", "5m", "1h 15m", "26h", "3d"]);
  });

  it("links repo runbooks into anipotts/system", () => {
    expect(opsRunbookHref("docs/runbooks/ops-mini.md")).toBe(
      "https://github.com/anipotts/system/blob/main/docs/runbooks/ops-mini.md",
    );
    expect(opsRunbookHref("https://example.com/r")).toBe(
      "https://example.com/r",
    );
  });

  it("lists states in severity-neutral contract order", () => {
    expect(OPS_V1_STATES).toEqual([
      "ok",
      "degraded",
      "failing",
      "stale",
      "asleep",
      "unknown",
    ]);
  });
});
