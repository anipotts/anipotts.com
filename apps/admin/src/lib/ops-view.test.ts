import { describe, expect, it } from "vitest";
import sample from "../fixtures/ops_v1.sample.json";
import {
  OPS_GROUP_PRIORITY,
  opsServices,
  parseOpsSnapshot,
  type OpsServiceView,
} from "./ops-v1";
import { parseOpsEvents, type OpsEvent, type OpsRunEvent } from "./ops-events";
import {
  OPS_BURST_GAP_MS,
  opsActivityRows,
  opsCadenceText,
  opsHostFacts,
  opsPlumbingCount,
  opsRecordsRuns,
  opsRunCount,
  opsRunHistory,
  opsRuns,
  opsSyncFreshness,
  opsSyncRows,
  opsNextRun,
  opsPeriodText,
  opsSchedulePeriod,
  opsTriggerFacts,
  opsUnverified,
} from "./ops-view";

// Synthetic values only, in System's shapes.
type Json = Record<string, any>;
const item = (seq: number, at: string, rest: Json): Json => ({
  seq,
  at,
  kind: "access",
  subject: "data.search",
  from_state: null,
  to_state: null,
  status: 200,
  ms: 40,
  detail: null,
  ...rest,
});
const parse = (items: Json[]): OpsEvent[] =>
  parseOpsEvents({ version: "ops_events_v1", items, next_after: null }, 0)
    .items;
const run = (seq: number, subject: string, at: string, rest: Json = {}) =>
  item(seq, at, {
    kind: "run",
    subject,
    status: 0,
    ms: null,
    detail: "1 run(s)",
    ...rest,
  });
const transition = (
  seq: number,
  subject: string,
  at: string,
  from: string | null,
  to: string,
) =>
  item(seq, at, {
    kind: "transition",
    subject,
    from_state: from,
    to_state: to,
    status: null,
    ms: null,
    detail: "disk 85% used",
  });

describe("host facts", () => {
  const host = (status: Json) =>
    ({
      status: {
        state: "ok",
        detail: "disk 63% used",
        last_success_at: "2026-09-22T18:01:39Z",
        disk_percent: null,
        uptime_s: null,
        awake: null,
        ...status,
      },
    }) as Pick<OpsServiceView, "status">;

  it("prefers System's fields and falls back to the detail", () => {
    expect(opsHostFacts(host({}))).toEqual({
      disk: 63,
      uptimeS: null,
      awake: null,
      sampledAt: "2026-09-22T18:01:39Z",
    });
    expect(
      opsHostFacts(host({ disk_percent: 71, uptime_s: 86_400, awake: true })),
    ).toMatchObject({ disk: 71, uptimeS: 86_400, awake: true });
    // Last known values keep the detail's figure.
    expect(
      opsHostFacts(host({ detail: "Last known ok: disk 70% used" })).disk,
    ).toBe(70);
    expect(opsHostFacts(host({ detail: "probe 200" })).disk).toBeNull();
    expect(opsHostFacts(host({ detail: "disk 400% used" })).disk).toBeNull();
  });

  it("reads an asleep host as not awake even without the field", () => {
    expect(
      opsHostFacts(host({ state: "asleep", detail: "ap-pro offline" })).awake,
    ).toBe(false);
  });
});

describe("cadence and triggers", () => {
  it("says an interval as people do", () => {
    expect(opsCadenceText(15)).toBe("every 15 s");
    expect(opsCadenceText(60)).toBe("every minute");
    expect(opsCadenceText(300)).toBe("every 5 min");
    expect(opsCadenceText(600)).toBe("every 10 min");
    expect(opsCadenceText(3600)).toBe("every hour");
    expect(opsCadenceText(14_400)).toBe("every 4 h");
    expect(opsCadenceText(5_400)).toBe("every 90 min");
    expect(opsCadenceText(86_400)).toBe("every day");
  });

  it("knows System records no runs for jobs faster than every 15 minutes", () => {
    expect(opsRecordsRuns({ interval_s: 60 })).toBe(false);
    expect(opsRecordsRuns({ interval_s: 899 })).toBe(false);
    expect(opsRecordsRuns({ interval_s: 900 })).toBe(true);
    expect(opsRecordsRuns({ interval_s: null })).toBe(true);
  });

  it("reads the period a schedule names, and none for a time of day", () => {
    expect(opsSchedulePeriod("hourly")).toBe(3600);
    expect(opsSchedulePeriod("every hour")).toBe(3600);
    expect(opsSchedulePeriod("every minute")).toBe(60);
    expect(opsSchedulePeriod("every 15 seconds")).toBe(15);
    expect(opsSchedulePeriod("every 15 min while awake")).toBe(900);
    expect(opsSchedulePeriod("every 4 hours")).toBe(14_400);
    expect(opsSchedulePeriod("nightly after 03:00")).toBeNull();
    expect(opsSchedulePeriod("daily 04:00")).toBeNull();
    expect(opsSchedulePeriod("every fortnight")).toBeNull();
    expect(opsSchedulePeriod(null)).toBeNull();
    expect(
      [15, 60, 900, 3600, 5400, 14_400, 172_800].map(opsPeriodText),
    ).toEqual(["15s", "1m", "15m", "1h", "90m", "4h", "2d"]);
  });

  describe("next run", () => {
    const sampledAt = "2026-09-22T18:01:39Z";
    const job = (
      schedule: string | null,
      interval: number | null,
      next: string | null,
      budget: number | null = 4500,
      trigger: "interval" | "calendar" = "interval",
    ) => ({
      trigger,
      schedule,
      freshness_budget_s: budget,
      sampledAt,
      status: { next_run_at: next, interval_s: interval },
    });

    it("hides a check time that has passed on a job whose schedule is not its interval", () => {
      // pc.inference on 2026-09-22: nightly work, checked hourly, next run
      // equal to generated_at. That is not a run that is due.
      expect(
        opsNextRun(job("nightly after 03:00", 3600, sampledAt, 93_600)),
      ).toBeNull();
      expect(
        opsNextRun(job("daily 04:00", 3600, "2026-09-22T17:30:00Z")),
      ).toBeNull();
      // Still ahead, it is shown as the next check, approximate.
      expect(
        opsNextRun(job("nightly after 03:00", 3600, "2026-09-22T18:40:00Z")),
      ).toMatchObject({ approximate: true });
    });

    it("keeps a late run due now until it passes the entry's own budget", () => {
      // pro.pc-send: every 15 min, a 30 min budget, 74 s late.
      const late = opsNextRun(
        job("every 15 min while awake", 900, "2026-09-22T18:00:25Z", 1800),
      )!;
      expect(late).toEqual({
        at: "2026-09-22T18:00:25Z",
        approximate: true,
        graceS: 1800,
      });
      expect(
        opsNextRun(job("every 10 min", 600, sampledAt, null))!.graceS,
      ).toBe(Number.POSITIVE_INFINITY);
    });

    it("keeps a calendar time exact and shows nothing without a next run", () => {
      expect(
        opsNextRun(
          job("daily 04:30", null, "2026-09-23T08:30:00Z", 93_600, "calendar"),
        ),
      ).toEqual({ at: "2026-09-23T08:30:00Z", approximate: false, graceS: 60 });
      expect(opsNextRun(job("hourly", 3600, null))).toBeNull();
    });
  });

  it("words each trigger, approximate only for intervals", () => {
    expect(
      opsTriggerFacts(
        { trigger: "interval", schedule: "hourly" },
        { interval_s: 3600 },
      ),
    ).toEqual({
      label: "Interval",
      cadence: "checks every 1h",
      approximate: true,
    });
    expect(
      opsTriggerFacts(
        { trigger: "calendar", schedule: "daily 04:30" },
        { interval_s: null },
      ),
    ).toEqual({
      label: "Calendar",
      cadence: "daily 04:30",
      approximate: false,
    });
    expect(
      opsTriggerFacts(
        { trigger: "keepalive", schedule: null },
        { interval_s: null },
      )?.cadence,
    ).toBe("always running");
    expect(
      opsTriggerFacts(
        { trigger: null, schedule: "hourly" },
        { interval_s: null },
      ),
    ).toBeNull();
  });

  it("never reads a restore drill that never ran as ok", () => {
    expect(opsUnverified({ status: { detail: "never_run" } })).toBe(true);
    expect(opsUnverified({ status: { detail: "ok" } })).toBe(false);
  });

  it("places recovery after backups in owner priority", () => {
    expect(OPS_GROUP_PRIORITY.indexOf("recovery")).toBe(
      OPS_GROUP_PRIORITY.indexOf("backups") + 1,
    );
  });
});

describe("runs", () => {
  it("reads the run count from System's detail, one when it does not say", () => {
    expect(opsRunCount({ detail: "2 run(s)" })).toBe(2);
    expect(opsRunCount({ detail: null })).toBe(1);
    expect(opsRunCount({ detail: "something else" })).toBe(1);
  });

  it("merges one finish time reported twice and lists newest first", () => {
    const events = parse([
      run(1, "pc.inference", "2026-09-22T07:54:30Z"),
      run(2, "pc.writer", "2026-09-22T16:02:05Z", { ms: 112_700 }),
      run(3, "pc.writer", "2026-09-22T16:44:53Z", { ms: 97_500 }),
      // launchd ran again with no new receipt: the same finish time.
      run(4, "pc.inference", "2026-09-22T07:54:30Z", { detail: "2 run(s)" }),
    ]) as OpsRunEvent[];
    expect(
      opsRuns(events).map((entry) => [entry.subject, entry.at, entry.runs]),
    ).toEqual([
      ["pc.writer", "2026-09-22T16:44:53Z", 1],
      ["pc.writer", "2026-09-22T16:02:05Z", 1],
      ["pc.inference", "2026-09-22T07:54:30Z", 3],
    ]);
    expect(opsRunHistory(events, "pc.writer").map((entry) => entry.ms)).toEqual(
      [97_500, 112_700],
    );
    expect(opsRunHistory(events, "pc.writer", 1)).toHaveLength(1);
    expect(opsRunHistory(events, "nothing.here")).toEqual([]);
  });
});

describe("activity rows", () => {
  it("folds plumbing away unless asked, keeping its failures", () => {
    const events = parse([
      item(1, "2026-09-22T10:00:00Z", { subject: "preflight", ms: 0 }),
      item(2, "2026-09-22T10:00:01Z", { subject: "ops.events", status: 401 }),
      item(3, "2026-09-22T10:10:00Z", {}),
      item(4, "2026-09-22T10:20:00Z", { subject: "probe", status: 200 }),
    ]);
    expect(opsPlumbingCount(events)).toBe(2);
    expect(opsActivityRows(events).map((row) => row.latest.subject)).toEqual([
      "data.search",
      "ops.events",
    ]);
    expect(opsActivityRows(events, { plumbing: true })).toHaveLength(4);
  });

  it("orders by when it happened, not by arrival", () => {
    const events = parse([
      transition(1, "host.ap-pro", "2026-09-22T16:42:37Z", "degraded", "ok"),
      run(2, "pc.writer", "2026-09-22T16:02:05Z"),
      item(3, "2026-09-22T16:50:00Z", {}),
    ]);
    expect(opsActivityRows(events).map((row) => row.latest.seq)).toEqual([
      3, 1, 2,
    ]);
  });

  it("folds a burst of one kind and subject into one row with a count", () => {
    const at = (minute: number, second = 0) =>
      `2026-09-22T17:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}Z`;
    const events = parse([
      transition(1, "host.ap-pro", at(10, 55), "ok", "degraded"),
      transition(2, "host.ap-pro", at(11, 58), "degraded", "ok"),
      transition(3, "host.ap-pro", at(13, 1), "ok", "degraded"),
      item(4, at(20), { device: "ap-pro" }),
      item(5, at(20, 30), { device: "ap-pro", ms: 60 }),
      item(6, at(21), { device: "ap-phone" }),
      // More than two minutes after the last one: its own row.
      item(7, at(24), { device: "ap-phone" }),
    ]);
    const rows = opsActivityRows(events);
    expect(
      rows.map((row) => [row.latest.seq, row.earliest.seq, row.count]),
    ).toEqual([
      [7, 7, 1],
      [6, 6, 1],
      [5, 4, 2],
      [3, 1, 3],
    ]);
    const flaps = rows.at(-1)!;
    expect(flaps.earliest.kind === "transition" && flaps.earliest.from).toBe(
      "ok",
    );
    expect(flaps.latest.kind === "transition" && flaps.latest.to).toBe(
      "degraded",
    );
    expect(OPS_BURST_GAP_MS).toBe(120_000);
  });

  it("counts a run reported twice once, with its launchd runs", () => {
    const events = parse([
      run(1, "pc.snapshot", "2026-09-22T08:55:22Z"),
      item(2, "2026-09-22T12:00:00Z", {}),
      run(3, "pc.snapshot", "2026-09-22T08:55:22Z"),
    ]);
    const rows = opsActivityRows(events);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ count: 1, runs: 2 });
  });

  it("never folds across days", () => {
    const events = parse([
      item(1, "2026-09-21T23:59:30Z", {}),
      item(2, "2026-09-22T00:00:30Z", {}),
    ]);
    const rows = opsActivityRows(events);
    const days = new Set(rows.map((row) => row.day));
    expect(rows).toHaveLength(days.size);
  });
});

describe("syncs", () => {
  const catalogEntry = (id: string, name: string, budget: number | null) => ({
    id,
    name,
    group: "personal context",
    kind: "job",
    host: "ap-pro",
    owner: "life",
    freshness_budget_s: budget,
    runbook: "docs/runbooks/ops-pro.md",
    schedule: null,
  });
  const snapshot = parseOpsSnapshot({
    ...structuredClone(sample),
    catalog: [
      ...sample.catalog,
      catalogEntry("pro.whatsapp", "whatsapp sync", null),
      catalogEntry("pro.pc-send", "pro intake and offsite upload", 1800),
      catalogEntry("pro.voicememos", "voice memos mirror", null),
    ],
    status: [
      ...sample.status,
      {
        id: "pro.pc-send",
        state: "ok",
        detail: "last pass completed",
        last_success_at: "2026-09-21T17:45:00Z",
        last_run_at: "2026-09-21T17:45:00Z",
        last_exit: 0,
      },
      {
        id: "pro.whatsapp",
        state: "ok",
        detail: "last run ok",
        last_success_at: "2026-09-21T13:00:00Z",
        last_run_at: "2026-09-21T13:00:00Z",
        last_exit: 0,
      },
    ],
  });
  const services = opsServices(snapshot);
  const now = Date.parse(snapshot.generated_at);

  it("lists every synced app in the catalog, by app, each with its sync", () => {
    expect(opsSyncRows(services).map((row) => row.key)).toEqual([
      "health.ingest:applehealth",
      "pro.pc-send:contacts",
      "pro.pc-send:messages",
      "pro.pc-send:voicememos",
      "pro.voicememos:voicememos",
      "pro.whatsapp:whatsapp",
    ]);
  });

  it("judges freshness against each sync's own budget, never a null one", () => {
    const byId = new Map(services.map((service) => [service.id, service]));
    expect(opsSyncFreshness(byId.get("pro.pc-send")!, now)).toBe("fresh");
    expect(opsSyncFreshness(byId.get("pro.pc-send")!, now + 2 * 3600_000)).toBe(
      "stale",
    );
    // A null budget is never stale, however old.
    expect(
      opsSyncFreshness(byId.get("pro.whatsapp")!, now + 30 * 86_400_000),
    ).toBe("unjudged");
    // No status row and no budget: still not judged, never fresh.
    expect(opsSyncFreshness(byId.get("pro.voicememos")!, now)).toBe("unjudged");
  });
});
