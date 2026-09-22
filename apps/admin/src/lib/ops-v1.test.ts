import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sample from "../fixtures/ops_v1.sample.json";
import { OPS_V1_SAMPLE_PROVENANCE } from "../fixtures/ops_v1.provenance";
import {
  OPS_V1_BOUNDS,
  OPS_V1_STATES,
  OpsSnapshotError,
  OPS_SAMPLER_STALE_SECONDS,
  opsFreshness,
  opsIsHost,
  opsOrdered,
  opsRenderedCounts,
  opsRunbookHref,
  opsSamplerStopped,
  opsServices,
  opsSnapshotAge,
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
    expect(opsRenderedCounts(services)).toMatchObject({ ok: 9, unknown: 2 });
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
    ["catalog entry", "cron", (v: Json) => (v.catalog[0].cron = "*/5 * * * *")],
    [
      "catalog entry",
      "private_note",
      (v: Json) => (v.catalog[0].private_note = "x"),
    ],
    ["status row", "schedule", (v: Json) => (v.status[0].schedule = "hourly")],
    [
      "status row",
      "message",
      (v: Json) => (v.status[0].message = "private text"),
    ],
  ])(
    "names an unknown field in the %s and never reads it",
    (_, name, mutate) => {
      const value = fresh();
      mutate(value);
      const snapshot = parseOpsSnapshot(value);
      expect(snapshot.unknown_fields).toEqual([name]);
      expect(
        JSON.stringify([...snapshot.status.values(), ...snapshot.catalog]),
      ).not.toContain("private text");
      expect(parseOpsSnapshot(fresh()).unknown_fields).toEqual([]);
    },
  );

  it("names odd field names only as other, and bounds the list", () => {
    const value = fresh();
    value.catalog[0]["Bad Name\u2028"] = 1;
    for (let index = 0; index < 40; index++)
      value.status[0][`f${index}`] = index;
    const names = parseOpsSnapshot(value).unknown_fields;
    expect(names).toContain("other");
    expect(names.length).toBe(OPS_V1_BOUNDS.maxUnknownFields);
    expect(names.every((name) => OPS_V1_BOUNDS.fieldName.test(name))).toBe(
      true,
    );
  });

  it.each([
    ["counts", (v: Json) => (v.counts.sleeping = 0)],
    ["root", (v: Json) => (v.events = [])],
  ])("still rejects an unknown field in the %s", (_, mutate) => {
    const value = fresh();
    mutate(value);
    rejects(value);
  });

  it("still rejects a known field with the wrong shape", () => {
    const value = fresh();
    value.status[0].last_exit = "0";
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

  it("accepts status only as the canonical array of rows", () => {
    const value = fresh();
    value.status = Object.fromEntries(
      value.status.map(({ id, ...row }: Json) => [id, row]),
    );
    rejects(value);
    const missingId = fresh();
    delete missingId.status[0].id;
    rejects(missingId);
  });

  it("requires schedule on every entry, as bounded text or null", () => {
    const catalog = parseOpsSnapshot(fresh()).catalog;
    expect(catalog.find((item) => item.id === "host.ap-mini")?.schedule).toBe(
      null,
    );
    expect(catalog.find((item) => item.id === "pc.snapshot")?.schedule).toBe(
      "daily 04:00",
    );
    const missing = fresh();
    delete missing.catalog[1].schedule;
    rejects(missing);
    for (const schedule of [
      "",
      3600,
      " hourly",
      "x".repeat(OPS_V1_BOUNDS.scheduleMax + 1),
    ]) {
      const bad = fresh();
      bad.catalog[0].schedule = schedule;
      rejects(bad);
    }
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

describe("run fields (2026-09-22)", () => {
  const withoutRunFields = () => {
    const value = fresh();
    for (const entry of value.catalog) delete entry.trigger;
    for (const row of value.status) {
      delete row.runs;
      delete row.interval_s;
      delete row.last_duration_s;
      delete row.next_run_at;
    }
    return value;
  };
  const withRow = (patch: Json) => {
    const value = fresh();
    Object.assign(value.status[0], patch);
    return value;
  };

  it("parses a snapshot with or without them", () => {
    const current = parseOpsSnapshot(fresh());
    const earlier = parseOpsSnapshot(withoutRunFields());
    expect(current.catalog.map((item) => item.id)).toEqual(
      earlier.catalog.map((item) => item.id),
    );
    const row = [...earlier.status.values()][0]!;
    expect(row).toMatchObject({
      runs: null,
      interval_s: null,
      last_duration_s: null,
      next_run_at: null,
    });
    expect(earlier.catalog.every((item) => item.trigger === null)).toBe(true);
  });

  it("keeps the fixture's triggers", () => {
    const triggers = parseOpsSnapshot(fresh()).catalog.map(
      (item) => item.trigger,
    );
    expect(triggers).toContain("sampled");
    expect(triggers).toContain("keepalive");
  });

  it("reads an unknown trigger as null instead of rejecting", () => {
    const value = fresh();
    value.catalog[0].trigger = "cron";
    expect(parseOpsSnapshot(value).catalog[0]!.trigger).toBeNull();
    value.catalog[0].trigger = "Not A Token";
    rejects(value);
    value.catalog[0].trigger = 5;
    rejects(value);
  });

  it("parses run counts, intervals, fractional durations and a future next run", () => {
    const value = withRow({
      runs: 412,
      interval_s: 3600,
      last_duration_s: 12.4,
      next_run_at: "2026-09-21T19:00:00Z",
    });
    const row = parseOpsSnapshot(value).status.get(value.status[0].id)!;
    expect(row).toMatchObject({
      runs: 412,
      interval_s: 3600,
      last_duration_s: 12.4,
      next_run_at: "2026-09-21T19:00:00Z",
    });
  });

  it("bounds each run field", () => {
    rejects(withRow({ runs: -1 }));
    rejects(withRow({ runs: 1.5 }));
    rejects(withRow({ interval_s: 0 }));
    rejects(withRow({ last_duration_s: -0.1 }));
    rejects(withRow({ last_duration_s: "12" }));
    rejects(withRow({ last_duration_s: Number.POSITIVE_INFINITY }));
    rejects(withRow({ next_run_at: "2026-09-21 19:00" }));
    rejects(withRow({ next_run_at: "2028-09-21T19:00:00Z" }));
  });

  it("names a row or entry field outside the contract", () => {
    expect(parseOpsSnapshot(withRow({ runs_total: 1 })).unknown_fields).toEqual(
      ["runs_total"],
    );
  });

  it("parses the host fields, bounded", () => {
    const value = withRow({ disk_percent: 63, uptime_s: 86_400, awake: true });
    const row = parseOpsSnapshot(value).status.get(value.status[0].id)!;
    expect(row).toMatchObject({
      disk_percent: 63,
      uptime_s: 86_400,
      awake: true,
    });
    const without = [...parseOpsSnapshot(fresh()).status.values()][0]!;
    expect(without).toMatchObject({
      disk_percent: null,
      uptime_s: null,
      awake: null,
    });
    rejects(withRow({ disk_percent: 101 }));
    rejects(withRow({ disk_percent: 50.5 }));
    rejects(withRow({ uptime_s: -1 }));
    rejects(withRow({ awake: "yes" }));
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
    rejects(entryCase("host", "Not A Host"));
    rejects(entryCase("host", 3));
    rejects(rowCase("state", "healthy"));
    rejects(rowCase("state", "OK"));
  });

  it("reads a machine it does not know yet as other", () => {
    expect(parseOpsSnapshot(entryCase("host", "ap-air")).catalog[0]!.host).toBe(
      "other",
    );
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
      ageSeconds: 900,
      budgetSeconds: 4500,
      overBudget: false,
    });
    const chatgpt = services.find((item) => item.id === "keepalive.chatgpt")!;
    expect(opsFreshness(chatgpt, now)).toMatchObject({ overBudget: false });
    expect(opsFreshness(chatgpt, now + 300_000)).toMatchObject({
      overBudget: true,
    });
    const health = services.find((item) => item.id === "health.api")!;
    expect(opsFreshness(health, now)).toEqual({
      kind: "liveness",
      ageSeconds: 0,
    });
    const sync = services.find((item) => item.id === "agents.sync")!;
    expect(opsFreshness(sync, now)).toEqual({ kind: "never" });
  });

  it("never judges a null budget stale, however old the last success", () => {
    const value = fresh();
    value.status.find(
      (row: Json) => row.id === "health.ingest",
    ).last_success_at = "2026-09-01T00:00:00Z";
    const ingest = opsServices(parseOpsSnapshot(value)).find(
      (item) => item.id === "health.ingest",
    )!;
    expect(ingest.freshness_budget_s).toBeNull();
    const freshness = opsFreshness(ingest, now);
    expect(freshness.kind).toBe("liveness");
    expect(freshness).not.toHaveProperty("overBudget");
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

describe("sampler freshness", () => {
  const snapshot = parseOpsSnapshot(fresh());
  const generated = Date.parse(sample.generated_at);

  it("treats a snapshot older than 60 seconds as a stopped sampler", () => {
    // System's sampler runs every 15 s.
    expect(OPS_SAMPLER_STALE_SECONDS).toBe(60);
    expect(opsSamplerStopped(snapshot, generated)).toBe(false);
    expect(opsSamplerStopped(snapshot, generated + 60_000)).toBe(false);
    expect(opsSamplerStopped(snapshot, generated + 61_000)).toBe(true);
    expect(opsSnapshotAge(snapshot, generated + 7 * 60_000)).toBe(420);
  });

  it("never reports a negative age for a clock behind the sampler", () => {
    expect(opsSnapshotAge(snapshot, generated - 5_000)).toBe(0);
    expect(opsSamplerStopped(snapshot, generated - 5_000)).toBe(false);
  });
});

describe("owner priority order", () => {
  it("orders personal context, backups, health ingest, agent sessions, services", () => {
    const ordered = opsOrdered(opsServices(parseOpsSnapshot(fresh())));
    const table = ordered.filter((item) => !opsIsHost(item));
    expect([...new Set(table.map((item) => item.group))]).toEqual([
      "personal context",
      "backups",
      "health ingest",
      "agent sessions",
      "services",
    ]);
    expect(
      table.filter((item) => item.group === "services").map((item) => item.id),
    ).toEqual(["agents.sync", "ops.sampler", "imessage.agent"]);
    expect(table.at(-1)?.id).toBe("imessage.agent");
  });

  it("sends the hosts group and host-kind entries to the strip", () => {
    const services = opsServices(parseOpsSnapshot(fresh()));
    expect(services.filter(opsIsHost).map((item) => item.id)).toEqual([
      "host.ap-mini",
    ]);
    const hostGroup = {
      ...services[1]!,
      kind: "service" as const,
      group: "hosts",
    };
    expect(opsIsHost(hostGroup)).toBe(true);
  });

  it("places groups it does not know after the known ones, in catalog order", () => {
    const value = fresh();
    for (const [index, group] of ["zeta", "alpha"].entries())
      value.catalog.push({ ...value.catalog[1], id: `new.${index}`, group });
    const groups = [
      ...new Set(
        opsOrdered(opsServices(parseOpsSnapshot(value)))
          .filter((item) => !opsIsHost(item))
          .map((item) => item.group),
      ),
    ];
    expect(groups.slice(-3)).toEqual(["services", "zeta", "alpha"]);
  });
});
