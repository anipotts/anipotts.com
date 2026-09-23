import { describe, expect, it } from "vitest";
import fixture from "../fixtures/ops_events_v1.synthetic.json";
import { OpsSnapshotError, type OpsCatalogEntry } from "./ops-v1";
import {
  EMPTY_EVENT_LOG,
  OPS_EVENTS_KEEP,
  appendOpsEvents,
  deriveOpsAlerts,
  opsAccessSummary,
  opsActivitySource,
  opsEventsMoveSnapshot,
  opsEventsPath,
  opsIncidentsBySubject,
  opsIsPlumbing,
  opsRouteLabel,
  opsEventsDrifted,
  parseOpsEvents,
  parseOpsEventsBytes,
  type OpsAccessEvent,
  type OpsTransitionEvent,
} from "./ops-events";

// Synthetic items only, shaped like System's ops_events_v1 rows.
type Json = Record<string, unknown>;
const access = (seq: number, extra: Json = {}): Json => ({
  seq,
  at: "2026-09-21T17:00:00Z",
  kind: "access",
  subject: "data.search",
  from_state: null,
  to_state: null,
  status: 200,
  ms: 84,
  detail: null,
  ...extra,
});
const transition = (
  seq: number,
  subject: string,
  from: string | null,
  to: string,
  at = `2026-09-21T${String(10 + (seq % 10)).padStart(2, "0")}:00:00Z`,
): Json => ({
  seq,
  at,
  kind: "transition",
  subject,
  from_state: from,
  to_state: to,
  status: null,
  ms: null,
  detail: "fixed detail",
});
const envelope = (items: Json[], next_after: number | null = null): Json => ({
  version: "ops_events_v1",
  items,
  next_after,
});
const rejects = (value: unknown, after = 0) =>
  expect(() => parseOpsEvents(value, after)).toThrow(OpsSnapshotError);
/** One bad item is skipped and counted; the page and its cursor survive. */
const skips = (value: Json, after = 0) => {
  const page = parseOpsEvents(value, after);
  expect(page.skipped).toBe(1);
  expect(page.items).toHaveLength((value.items as unknown[]).length - 1);
  expect(page.lastSeq).toBe((value.items as Json[]).at(-1)!.seq);
};

describe("ops_events_v1 parser", () => {
  it("accepts System's synthetic fixture", () => {
    const page = parseOpsEvents(fixture, 0);
    expect(page.items).toHaveLength(fixture.items.length);
    expect(page.nextAfter).toBeNull();
    expect(page.items[0]).toMatchObject({
      kind: "transition",
      from: null,
      to: "ok",
    });
  });

  it("requires exactly the nine keys, with device optional", () => {
    const [plain] = parseOpsEvents(envelope([access(1)]), 0).items;
    expect(plain).toMatchObject({ kind: "access", status: 200, ms: 84 });
    expect((plain as OpsAccessEvent).device).toBeNull();
    const [withDevice] = parseOpsEvents(
      envelope([access(1, { device: "ap-phone" })]),
      0,
    ).items;
    expect((withDevice as OpsAccessEvent).device).toBe("ap-phone");
    const [unknownDevice] = parseOpsEvents(
      envelope([access(1, { device: "ap-watch" })]),
      0,
    ).items;
    expect((unknownDevice as OpsAccessEvent).device).toBe("other");
    const [nullDevice] = parseOpsEvents(
      envelope([access(1, { device: null })]),
      0,
    ).items;
    expect((nullDevice as OpsAccessEvent).device).toBeNull();
    const extra = parseOpsEvents(envelope([access(1, { extra: 1 })]), 0);
    expect(extra.items).toHaveLength(1);
    expect(extra.unknownFields).toEqual(["extra"]);
    expect(parseOpsEvents(envelope([access(1)]), 0).unknownFields).toEqual([]);
    skips(envelope([access(1, { status: "200" })]));
    const missing = access(1);
    delete missing.detail;
    skips(envelope([missing]));
  });

  it("keeps an unknown kind as other instead of rejecting the page", () => {
    const [event] = parseOpsEvents(
      envelope([
        {
          ...access(1),
          kind: "deploy",
          subject: "admin",
          status: null,
          ms: null,
        },
      ]),
      0,
    ).items;
    expect(event).toMatchObject({ kind: "other", rawKind: "deploy" });
    skips(envelope([{ ...access(1), kind: "Not A Kind" }]));
  });

  it("requires a catalog id and a to_state on transitions", () => {
    skips(envelope([transition(1, "Not An Id", null, "ok")]));
    skips(
      envelope([{ ...transition(1, "pc.writer", null, "ok"), to_state: null }]),
    );
    skips(envelope([transition(1, "pc.writer", null, "sideways")]));
    skips(envelope([transition(1, "pc.writer", "sideways", "ok")]));
  });

  it("requires status and ms on access rows", () => {
    skips(envelope([access(1, { status: null })]));
    skips(envelope([access(1, { ms: null })]));
    skips(envelope([access(1, { status: 99 })]));
    skips(envelope([access(1, { ms: -1 })]));
    skips(envelope([access(1, { subject: "data search?q=secret" })]));
  });

  it("parses run rows with an exit code and a duration, either may be null", () => {
    const run = (seq: number, extra: Json = {}): Json => ({
      ...access(seq),
      kind: "run",
      subject: "pc.writer",
      status: 0,
      ms: 12_400,
      detail: "1 run(s)",
      ...extra,
    });
    const page = parseOpsEvents(
      envelope([
        run(1),
        run(2, { status: 1, ms: null }),
        run(3, { status: null }),
      ]),
      0,
    );
    expect(page.items).toEqual([
      expect.objectContaining({
        kind: "run",
        subject: "pc.writer",
        exit: 0,
        ms: 12_400,
      }),
      expect.objectContaining({ kind: "run", exit: 1, ms: null }),
      expect.objectContaining({ kind: "run", exit: null }),
    ]);
    expect(opsActivitySource(page.items[0]!, new Map())).toEqual({
      id: "kind:run",
      label: "Runs",
    });
    skips(envelope([run(1, { subject: "not an id" })]));
    skips(envelope([run(1, { status: 1.5 })]));
    skips(envelope([run(1, { status: 2 ** 31 })]));
  });

  it("keeps HTTP status bounds on access rows only", () => {
    skips(envelope([access(1, { status: 0 })]));
    skips(envelope([access(1, { status: 600 })]));
  });

  it("keeps a run longer than an hour, but not an access that slow", () => {
    const run = {
      ...access(1),
      kind: "run",
      subject: "pc.writer",
      status: 0,
      ms: 3 * 60 * 60 * 1000,
    };
    const [event] = parseOpsEvents(envelope([run]), 0).items;
    expect(event).toMatchObject({ kind: "run", ms: 3 * 60 * 60 * 1000 });
    skips(envelope([access(1, { ms: 60 * 60 * 1000 + 1 }), access(2)]));
  });

  it("moves the cursor past a skipped last item instead of reading it again", () => {
    const page = parseOpsEvents(
      envelope([access(1), access(2, { ms: -1 })]),
      0,
    );
    expect(page.items.map((event) => event.seq)).toEqual([1]);
    expect(page.lastSeq).toBe(2);
    const log = appendOpsEvents(EMPTY_EVENT_LOG, page.items, [], page.lastSeq);
    expect(log.cursor).toBe(2);
    const onlyBad = parseOpsEvents(envelope([access(3, { status: null })]), 2);
    expect(
      appendOpsEvents(log, onlyBad.items, [], onlyBad.lastSeq).cursor,
    ).toBe(3);
    expect(appendOpsEvents(log, [], [], null)).toBe(log);
  });

  it("counts a skipped item into the log, so it is never dropped unseen", () => {
    const page = parseOpsEvents(
      envelope([access(1), access(2, { ms: -1 })]),
      0,
    );
    const log = appendOpsEvents(
      EMPTY_EVENT_LOG,
      page.items,
      [],
      page.lastSeq,
      page.skipped,
    );
    expect(log.skipped).toBe(1);
    const next = parseOpsEvents(envelope([access(3, { status: null })]), 2);
    expect(
      appendOpsEvents(log, next.items, [], next.lastSeq, next.skipped).skipped,
    ).toBe(2);
    expect(EMPTY_EVENT_LOG.skipped).toBe(0);
  });

  it("reads a mostly unreadable page as drift, and still moves past it", () => {
    // A format change in one field breaks every item: never a quiet page,
    // and never the same page read again forever.
    const page = parseOpsEvents(
      envelope([
        access(1, { at: "2026-09-22 10:00:00" }),
        access(2, { at: "2026-09-22 10:00:00" }),
        access(3, { at: "2026-09-22 10:00:00" }),
      ]),
      0,
    );
    expect(page).toMatchObject({ items: [], skipped: 3, lastSeq: 3 });
    expect(opsEventsDrifted(page.skipped, 3)).toBe(true);
  });

  it("skips and counts a few strays on an otherwise readable page", () => {
    const page = parseOpsEvents(
      envelope([
        access(1),
        access(2, { ms: -1 }),
        access(3),
        access(4, { status: null }),
        access(5),
      ]),
      0,
    );
    expect(page.items.map((event) => event.seq)).toEqual([1, 3, 5]);
    expect(page.skipped).toBe(2);
    expect(page.lastSeq).toBe(5);
    expect(opsEventsDrifted(2, 5)).toBe(false);
    expect(opsEventsDrifted(3, 5)).toBe(true);
    expect(opsEventsDrifted(0, 0)).toBe(false);
  });

  it("still rejects an item whose own seq is unreadable", () => {
    rejects(envelope([access(1), { ...access(2), seq: "2" }]));
    rejects(envelope([{ nonsense: true }]));
  });

  it("requires seq to ascend above after", () => {
    rejects(envelope([access(5)]), 5);
    rejects(envelope([access(2), access(2)]));
    rejects(envelope([access(3), access(2)]));
    expect(
      parseOpsEvents(envelope([access(6), access(9)]), 5).items,
    ).toHaveLength(2);
  });

  it("accepts next_after only as the last seq, or null", () => {
    expect(
      parseOpsEvents(envelope([access(1), access(2)], 2), 0).nextAfter,
    ).toBe(2);
    rejects(envelope([access(1), access(2)], 1));
    rejects(envelope([], 3));
    expect(parseOpsEvents(envelope([]), 7).items).toEqual([]);
  });

  it("requires the ops_events_v1 version, the root keys and the 500 cap", () => {
    rejects({ ...envelope([]), version: "ops_events_v2" });
    rejects({ ...envelope([]), extra: true });
    rejects({ version: "ops_events_v1", items: [] });
    const many = Array.from({ length: 501 }, (_, index) => access(index + 1));
    rejects(envelope(many));
    expect(parseOpsEvents(envelope(many.slice(0, 500)), 0).items).toHaveLength(
      500,
    );
  });

  it("rejects bytes that are not UTF-8 JSON", () => {
    expect(() => parseOpsEventsBytes(new TextEncoder().encode("{"), 0)).toThrow(
      OpsSnapshotError,
    );
    expect(
      parseOpsEventsBytes(
        new TextEncoder().encode(JSON.stringify(envelope([access(1)]))),
        0,
      ).items,
    ).toHaveLength(1);
  });
});

describe("events request path", () => {
  // The source infers `limit` as the literal 500; widen it to test bounds.
  const path = opsEventsPath as (after: number, limit?: number) => string;
  it("carries only after and limit, within bounds", () => {
    expect(path(0)).toBe("/v1/ops/events?after=0&limit=500");
    expect(path(42, 100)).toBe("/v1/ops/events?after=42&limit=100");
    for (const [after, limit] of [
      [-1, 100],
      [1.5, 100],
      [0, 0],
      [0, 501],
      [10_000_000_001, 100],
    ])
      expect(() => path(after!, limit)).toThrow(OpsSnapshotError);
  });
});

describe("event log in memory", () => {
  it("moves the cursor to the last seq and keeps transitions apart", () => {
    const { items } = parseOpsEvents(
      envelope([transition(1, "pc.writer", null, "ok"), access(2)]),
      0,
    );
    const log = appendOpsEvents(EMPTY_EVENT_LOG, items);
    expect(log.cursor).toBe(2);
    expect(log.transitions.map((event) => event.seq)).toEqual([1]);
    expect(log.recent.map((event) => event.seq)).toEqual([1, 2]);
    expect(appendOpsEvents(log, [])).toBe(log);
  });

  it("caps recent events and transitions, keeping the newest", () => {
    const many = Array.from(
      { length: OPS_EVENTS_KEEP.recent + 10 },
      (_, index) => access(index + 1),
    );
    const log = appendOpsEvents(
      EMPTY_EVENT_LOG,
      parseOpsEvents(envelope(many.slice(0, 500)), 0).items,
    );
    const next = appendOpsEvents(
      appendOpsEvents(
        log,
        parseOpsEvents(envelope(many.slice(500, 1000)), 500).items,
      ),
      parseOpsEvents(envelope(many.slice(1000)), 1000).items,
    );
    expect(next.recent).toHaveLength(OPS_EVENTS_KEEP.recent);
    expect(next.recent[0]?.seq).toBe(11);
    expect(next.cursor).toBe(OPS_EVENTS_KEEP.recent + 10);
  });
});

describe("alerts from transitions", () => {
  const parse = (items: Json[]) =>
    parseOpsEvents(envelope(items), 0).items as OpsTransitionEvent[];

  it("fires on failing, stale or degraded and resolves on a later ok", () => {
    const alerts = deriveOpsAlerts(
      parse([
        transition(1, "a.job", null, "ok", "2026-09-21T08:00:00Z"),
        transition(2, "a.job", "ok", "failing", "2026-09-21T09:00:00Z"),
        transition(3, "b.job", null, "degraded", "2026-09-21T09:30:00Z"),
        transition(4, "c.job", null, "stale", "2026-09-21T10:00:00Z"),
        transition(5, "d.job", null, "failing", "2026-09-21T07:00:00Z"),
        transition(6, "d.job", "failing", "ok", "2026-09-21T07:30:00Z"),
      ]),
    );
    expect(alerts.map((alert) => [alert.subject, alert.status])).toEqual([
      ["c.job", "firing"],
      ["b.job", "firing"],
      ["a.job", "firing"],
      ["d.job", "resolved"],
    ]);
    expect(alerts[2]).toMatchObject({
      state: "failing",
      since: "2026-09-21T09:00:00Z",
    });
    // Opened on first sight: its start was not observed, only bounded.
    expect(alerts[3]).toMatchObject({
      state: "failing",
      since: null,
      startedBefore: "2026-09-21T07:00:00Z",
      firstSeen: true,
      resolvedAt: "2026-09-21T07:30:00Z",
    });
  });

  it("A-31: never dates a first-sight problem from when System first saw it", () => {
    // The live cred.expiry shape: a new catalog row first sampled already
    // failing, its own detail saying the problem is 59 days old.
    const detail =
      "the Connect write token expired 59d ago; unattended secret writes and token factories blocked, 3 more flagged";
    const [alert] = deriveOpsAlerts(
      parse([
        {
          ...transition(357, "cred.expiry", null, "failing"),
          at: "2026-09-22T21:26:20Z",
          detail,
        },
      ]),
    );
    expect(alert).toMatchObject({
      subject: "cred.expiry",
      status: "firing",
      state: "failing",
      since: null,
      startedBefore: "2026-09-22T21:26:20Z",
      firstSeen: true,
      detail,
    });
    // A change within the episode keeps it unobserved; a problem after a
    // later ok is observed from its own transition.
    const [again] = deriveOpsAlerts(
      parse([
        transition(1, "a.job", null, "degraded", "2026-09-22T01:00:00Z"),
        transition(2, "a.job", "degraded", "failing", "2026-09-22T02:00:00Z"),
      ]),
    );
    expect(again).toMatchObject({ since: null, firstSeen: true });
    const [observed] = deriveOpsAlerts(
      parse([
        transition(1, "a.job", null, "failing", "2026-09-22T01:00:00Z"),
        transition(2, "a.job", "failing", "ok", "2026-09-22T02:00:00Z"),
        transition(3, "a.job", "ok", "failing", "2026-09-22T03:00:00Z"),
      ]),
    );
    expect(observed).toMatchObject({
      since: "2026-09-22T03:00:00Z",
      status: "firing",
    });
    expect(observed!.firstSeen).toBeUndefined();
  });

  it("dates an episode from its first problem, even as the problem changes", () => {
    const [alert] = deriveOpsAlerts(
      parse([
        transition(1, "a.job", null, "ok", "2026-09-21T08:00:00Z"),
        transition(2, "a.job", "ok", "degraded", "2026-09-21T09:00:00Z"),
        transition(3, "a.job", "degraded", "failing", "2026-09-21T10:00:00Z"),
      ]),
    );
    expect(alert).toMatchObject({
      status: "firing",
      state: "failing",
      since: "2026-09-21T09:00:00Z",
    });
  });

  it("never fires or resolves on unknown or asleep", () => {
    expect(
      deriveOpsAlerts(
        parse([
          transition(1, "a.job", null, "unknown"),
          transition(2, "b.host", null, "asleep"),
        ]),
      ),
    ).toEqual([]);
    // A problem that goes unknown is no longer firing and not resolved.
    expect(
      deriveOpsAlerts(
        parse([
          transition(1, "a.job", null, "failing"),
          transition(2, "a.job", "failing", "unknown"),
        ]),
      ),
    ).toEqual([]);
  });

  it("derives the fixture's alerts", () => {
    const log = appendOpsEvents(
      EMPTY_EVENT_LOG,
      parseOpsEvents(fixture, 0).items,
    );
    expect(
      deriveOpsAlerts(log.transitions).map((alert) => [
        alert.subject,
        alert.status,
      ]),
    ).toEqual([
      ["keepalive.onepassword-connect", "firing"],
      ["pc.inference", "firing"],
      ["pc.snapshot", "firing"],
      ["agents.sync", "resolved"],
      ["pc.writer", "resolved"],
    ]);
  });
});

describe("activity wording", () => {
  const [event] = parseOpsEvents(envelope([access(1)]), 0)
    .items as OpsAccessEvent[];

  it("reads access rows as route, status and latency", () => {
    expect(opsAccessSummary(event!)).toBe("Data search, 200, 84 ms");
    expect(opsAccessSummary({ ...event!, device: "ap-pro" })).toBe(
      "Data search, 200, 84 ms, ap-pro",
    );
    expect(opsRouteLabel("data.get")).toBe("Data record");
    expect(opsRouteLabel("ops.events")).toBe("Ops events");
    expect(opsRouteLabel("brand.new")).toBe("brand.new");
  });

  it("names sources by catalog group, reader access and kind", () => {
    const catalog = new Map([
      ["pc.writer", { group: "personal context" } as OpsCatalogEntry],
    ]);
    expect(opsActivitySource(event!, catalog)).toEqual({
      id: "access",
      label: "Reader access",
    });
    const [writer, stranger, deploy] = parseOpsEvents(
      envelope([
        transition(1, "pc.writer", null, "ok"),
        transition(2, "x.job", null, "ok"),
        { ...access(3), kind: "deploy", status: null, ms: null },
      ]),
      0,
    ).items;
    expect(opsActivitySource(writer!, catalog)).toEqual({
      id: "group:personal context",
      label: "Personal context",
    });
    expect(opsActivitySource(stranger!, catalog).label).toBe(
      "Not in the catalog",
    );
    expect(opsActivitySource(deploy!, catalog)).toEqual({
      id: "kind:deploy",
      label: "Deploy",
    });
  });
});

describe("round-2 events", () => {
  const parse = (items: Json[]) => parseOpsEvents(envelope(items), 0).items;
  const run = (seq: number, subject: string): Json => ({
    ...access(seq),
    kind: "run",
    subject,
    status: 0,
    ms: 5200,
    detail: "1 run(s)",
  });

  it("keeps runs apart for run history, and names drift fields", () => {
    const log = appendOpsEvents(
      EMPTY_EVENT_LOG,
      parse([run(1, "pc.writer"), access(2), run(3, "pc.snapshot")]),
      ["tier"],
    );
    expect(log.runs.map((event) => event.subject)).toEqual([
      "pc.writer",
      "pc.snapshot",
    ]);
    expect(log.recent).toHaveLength(3);
    const next = appendOpsEvents(log, [], ["region", "tier"]);
    expect(next.unknownFields).toEqual(["region", "tier"]);
    expect(next.cursor).toBe(3);
    expect(appendOpsEvents(next, [], ["tier"])).toBe(next);
  });

  it("moves the snapshot only for a transition or a run", () => {
    expect(opsEventsMoveSnapshot(parse([access(1)]))).toBe(false);
    expect(opsEventsMoveSnapshot(parse([access(1), run(2, "pc.writer")]))).toBe(
      true,
    );
    expect(
      opsEventsMoveSnapshot(parse([transition(1, "pc.writer", null, "ok")])),
    ).toBe(true);
  });

  it("names every live reader route, health included", () => {
    expect(opsRouteLabel("health.health")).toBe("Health daily");
    expect(opsRouteLabel("activity.activity")).toBe("Activity feed");
  });

  it("calls preflights, the probe and admin's successful polls plumbing", () => {
    const [preflight, probe, poll, failed, read] = parse([
      access(1, { subject: "preflight", status: 200, ms: 0 }),
      access(2, { subject: "probe", status: 200 }),
      access(3, { subject: "ops.snapshot", status: 304 }),
      access(4, { subject: "ops.events", status: 401 }),
      access(5),
    ]);
    expect(opsIsPlumbing(preflight!)).toBe(true);
    expect(opsIsPlumbing(probe!)).toBe(true);
    expect(opsIsPlumbing(poll!)).toBe(true);
    // A failure is an exception, never plumbing.
    expect(opsIsPlumbing(failed!)).toBe(false);
    expect(opsIsPlumbing(read!)).toBe(false);
  });

  it("reads each incident: its peak, its span and how many there were", () => {
    const at = (hour: number) =>
      `2026-09-22T${String(hour).padStart(2, "0")}:00:00Z`;
    const transitions = parse([
      transition(1, "host.ap-pro", null, "failing", at(5)),
      transition(2, "host.ap-pro", "failing", "degraded", at(8)),
      transition(3, "host.ap-pro", "degraded", "ok", at(16)),
      transition(4, "host.ap-pro", "ok", "degraded", at(17)),
      transition(5, "host.ap-pro", "degraded", "ok", at(18)),
      transition(6, "content.d1-export", null, "failing", at(1)),
      transition(7, "content.d1-export", "failing", "ok", at(2)),
      transition(8, "content.d1-export", "ok", "failing", at(4)),
    ]) as OpsTransitionEvent[];
    const incidents = opsIncidentsBySubject(transitions);
    expect(
      incidents
        .get("host.ap-pro")!
        .map((incident) => [
          incident.status,
          incident.peak,
          incident.state,
          incident.since,
          incident.resolvedAt,
        ]),
    ).toEqual([
      ["resolved", "degraded", "degraded", at(17), at(18)],
      // Failing, then degraded: it was failing at its worst. It opened on
      // first sight, so its start is only bounded (A-31).
      ["resolved", "failing", "degraded", null, at(16)],
    ]);
    expect(incidents.get("host.ap-pro")![1]).toMatchObject({
      startedBefore: at(5),
      firstSeen: true,
    });
    const alerts = deriveOpsAlerts(transitions);
    expect(
      alerts.map((alert) => [alert.subject, alert.status, alert.incidents]),
    ).toEqual([
      ["content.d1-export", "firing", 2],
      ["host.ap-pro", "resolved", 2],
    ]);
  });
});
