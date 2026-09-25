import { describe, expect, it } from "vitest";
import dataFixture from "../../fixtures/data_v1.synthetic.json";
import { SOURCE_STATUSES, parseSource, type DataSourceRow } from "./data-model";
import {
  DISCOVERED_GROUP,
  SOURCE_GROUPS,
  sourceConnector,
  sourceGroup,
  sourceHost,
  sourceRows,
  sourceState,
  type SourceJobs,
} from "./sources-model";

const NOW = Date.parse("2026-09-22T12:00:00Z");
// Times are relative to a fixed instant; nothing here reads a clock.
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
/** A reader row as System serves it today, plus any proposed field. */
const row = (id: string, extra: Record<string, unknown> = {}) =>
  parseSource({
    source_id: id,
    first_observed_at: ago(60 * 24 * 30),
    last_observed_at: ago(30),
    record_count: 10,
    revision_count: 12,
    ...extra,
  })!;
const empty = (id: string, extra: Record<string, unknown> = {}) =>
  row(id, {
    first_observed_at: null,
    last_observed_at: null,
    record_count: 0,
    revision_count: 0,
    ...extra,
  });

describe("source rows as System serves them", () => {
  it("parses the five served fields and each proposed field, optional-first", () => {
    const today = row("ani-browsing");
    expect(today).toMatchObject({
      id: "ani-browsing",
      records: 10,
      revisions: 12,
      connector: null,
      host: null,
      collection: null,
      status: null,
      job: null,
      transport: null,
      lastSuccessAt: null,
    });
    expect(
      row("ani-browsing", {
        display_name: "Browsing",
        connector: "browsing",
        host: "ap-pro",
        collection: "live",
        status: "current",
        adapter: "memory/personal_context/adapters/browser_rollup.py",
        job: "pro.pc-send",
        transport: "launchd",
        discovered_count: 3,
        excluded_count: 1,
        failed_count: 0,
        last_success_at: ago(10),
        held_from: ago(9000),
        held_to: ago(10),
      }),
    ).toEqual({
      id: "ani-browsing",
      records: 10,
      revisions: 12,
      firstObservedAt: ago(60 * 24 * 30),
      lastObservedAt: ago(30),
      displayName: "Browsing",
      connector: "browsing",
      host: "ap-pro",
      collection: "live",
      status: "current",
      job: "pro.pc-send",
      transport: "launchd",
      discoveredCount: 3,
      lastSuccessAt: ago(10),
      heldTo: ago(10),
      unknownFields: [],
    });
  });

  it("reads a value outside System's vocabulary as absent, and ignores unknown fields", () => {
    const odd = row("gmail-work", {
      connector: "fax",
      collection: "sometimes",
      status: "great",
      job: "a/b",
      host: "a b",
      path: "/Users/someone/private",
      notes: "anything",
    });
    expect(odd).toMatchObject({
      connector: null,
      collection: null,
      // A status is System's word even when admin cannot read it.
      status: "unknown",
      job: null,
      host: null,
      unknownFields: ["notes", "path"],
    });
    expect(JSON.stringify(odd)).not.toContain("private");
    expect(sourceConnector(odd)).toBe("mail");
  });

  it("A-3: reads a status outside System's vocabulary as unknown for that source alone", () => {
    for (const status of ["great", "CURRENT", "", 42, true, {}, ["current"]])
      expect(row("gmail-work", { status }).status, String(status)).toBe(
        "unknown",
      );
    // One odd item never costs its neighbours their own status.
    const items = [
      row("gmail-work", { status: "live-ish" }),
      row("ani-contacts", { status: "partial" }),
    ];
    expect(items.map((item) => item.status)).toEqual(["unknown", "partial"]);
  });

  it("A-3: reads a reply without status (an older reader) as not reported", () => {
    expect(row("ani-contacts").status).toBeNull();
    expect(row("ani-contacts", { status: null }).status).toBeNull();
    expect(sourceState(row("ani-contacts"))).toBe("unreported");
  });

  it("names unknown fields, bounded, without reading them", () => {
    const extra = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [`field_${index}`, index]),
    );
    const many = row("manual", { "Bad Name!": 1, ...extra });
    expect(many.unknownFields).toHaveLength(16);
    expect(many.unknownFields).toContain("other");
    expect(many.unknownFields).not.toContain("Bad Name!");
  });
});

// The keys personal_context_data_v1 serves per source (system#231), plus
// collection (system#236) where a test names one.
const served = (
  id: string,
  status: unknown,
  extra: Record<string, unknown> = {},
) =>
  parseSource({
    source_id: id,
    status,
    first_observed_at: ago(60 * 24 * 30),
    last_observed_at: ago(30),
    record_count: 10,
    revision_count: 12,
    ...extra,
  })!;

describe("System's status for every source", () => {
  it.each([
    ["excluded", "excluded", "excluded", "unknown"],
    ["partial", "connected", "partial", "live"],
    ["discovered", "discovered", "discovered", "discovered"],
    ["current", "live", "live", "live"],
    ["pending", "connected", "pending", "live"],
    ["unavailable", "attention", "unavailable", "live"],
    ["failed", "attention", "failed", "live"],
    ["paused", "paused", "paused", "live"],
    ["great", "attention", "unjudged", "live"],
  ])(
    "A-3: reads %s as the %s group and the %s state",
    (status, group, state, collection) => {
      const source = served("ani-food-orders", status, { collection });
      expect(sourceGroup(source)).toBe(group);
      expect(sourceState(source)).toBe(state);
    },
  );

  it("A-3: never lets a count stand in for a status System served", () => {
    // Nothing recorded, but System has a word: never folded as discovered.
    const none = { record_count: 0, revision_count: 0 };
    expect(sourceGroup(served("gmail-work", "pending", none))).toBe(
      "connected",
    );
    expect(sourceGroup(served("gmail-work", "great", none))).toBe("attention");
    expect(sourceState(served("gmail-work", "great", none))).toBe("unjudged");
  });

  it("A-3: shows Live only for current, whatever the job says", () => {
    const jobs: SourceJobs = new Map([["pc.writer", { state: "ok" }]]);
    for (const status of [...SOURCE_STATUSES, "great", null]) {
      for (const extra of [
        {},
        { collection: "live" },
        { collection: "live", job: "pc.writer" },
        { job: "pc.writer" },
        { collection: "unknown" },
        { collection: "unknown", job: "pc.writer" },
      ]) {
        const state = sourceState(served("ani-browsing", status, extra), jobs);
        // Live also needs System's live collection (system#236).
        if (status === "current" && extra.collection === "live")
          expect(state, JSON.stringify(extra)).toBe("live");
        else
          expect(state, `${status} ${JSON.stringify(extra)}`).not.toBe("live");
      }
    }
    // A pending source under an ok job is Syncing; a stale job still wins.
    expect(
      sourceState(
        served("ani-browsing", "pending", {
          collection: "live",
          job: "pc.writer",
        }),
        jobs,
      ),
    ).toBe("pending");
    expect(
      sourceState(
        served("ani-browsing", "current", {
          collection: "live",
          job: "pc.writer",
        }),
        new Map([["pc.writer", { state: "stale" }]]),
      ),
    ).toBe("stale");
    // A one-shot import that finished is Imported once, not Live.
    expect(
      sourceState(
        served("ani-food-orders", "current", { collection: "one_shot" }),
      ),
    ).toBe("imported");
  });

  it("A-3: never heads a source Live unless it is current and judged live", () => {
    const jobs: SourceJobs = new Map([
      ["pc.writer", { state: "ok" }],
      ["pc.snapshot", { state: "stale" }],
      ["pc.inference", { state: "failing" }],
      ["host.ap-pro", { state: "degraded" }],
      ["pro.whatsapp", { state: "asleep" }],
    ]);
    const live = (status: string, job?: string) =>
      served("ani-browsing", status, {
        collection: "live",
        ...(job ? { job } : {}),
      });
    expect(sourceGroup(live("current", "pc.writer"), jobs)).toBe("live");
    expect(sourceGroup(live("current"), jobs)).toBe("live");
    // A job's exception moves a current source out of Live.
    expect(sourceGroup(live("current", "pc.snapshot"), jobs)).toBe("attention");
    expect(sourceGroup(live("current", "pc.inference"), jobs)).toBe(
      "attention",
    );
    expect(sourceGroup(live("current", "host.ap-pro"), jobs)).toBe("attention");
    expect(sourceGroup(live("current", "pro.whatsapp"), jobs)).toBe(
      "connected",
    );
    // Unjudged is never Live: a multi-app pass or an unlisted job.
    expect(sourceGroup(live("current", "pro.pc-send"), jobs)).toBe("connected");
    expect(sourceGroup(live("current", "pro.gone"), jobs)).toBe("connected");
    // collection: live never heads a source Live on its own.
    expect(sourceGroup(live("failed", "pc.writer"), jobs)).toBe("attention");
    expect(sourceGroup(live("paused", "pc.writer"), jobs)).toBe("paused");
    expect(sourceGroup(live("unavailable"), jobs)).toBe("attention");
    expect(sourceGroup(live("partial", "pc.writer"), jobs)).toBe("connected");
    expect(sourceState(live("partial", "pc.writer"), jobs)).toBe("partial");
    expect(sourceGroup(live("pending", "pc.writer"), jobs)).toBe("connected");
    for (const [key, label] of [
      ["attention", "Needs attention"],
      ["paused", "Paused"],
    ] as const)
      expect(SOURCE_GROUPS[key]).toBe(label);
  });

  it("A-3: lets collection say Imported once only when the status agrees", () => {
    const once = (status: string) =>
      served("ani-food-orders", status, { collection: "one_shot" });
    expect(sourceGroup(once("current"))).toBe("imported");
    expect(sourceState(once("current"))).toBe("imported");
    expect(sourceGroup(once("partial"))).toBe("imported");
    expect(sourceState(once("partial"))).toBe("partial");
    expect(sourceGroup(once("pending"))).toBe("connected");
    expect(sourceGroup(once("failed"))).toBe("attention");
    expect(sourceGroup(once("paused"))).toBe("paused");
  });

  it("A-3: never reads a current source Live when System names no collection", () => {
    // manual on prod: current, and its catalog entry names no collection
    // (system#236 "unknown"), which reads null, as an absent key does.
    const manual = served("manual", "current", {
      connector: "other",
      collection: "unknown",
    });
    expect(manual.collection).toBeNull();
    expect(sourceState(manual)).toBe("unjudged");
    expect(sourceGroup(manual)).toBe("connected");
    // An ok job proves no schedule either.
    const jobs: SourceJobs = new Map([["pc.writer", { state: "ok" }]]);
    const withJob = served("manual", "current", {
      collection: "unknown",
      job: "pc.writer",
    });
    expect(sourceState(withJob, jobs)).toBe("unjudged");
    expect(sourceGroup(withJob, jobs)).toBe("connected");
    const [only] = sourceRows([manual]);
    expect(only).toMatchObject({ group: "connected", state: "unjudged" });
    expect(SOURCE_GROUPS[only!.group]).toBe("Connected");
  });

  it("A-3: reads a current source System collects live, with no job, as Live", () => {
    const source = served("ani-github-ledger", "current", {
      collection: "live",
    });
    expect(source.job).toBeNull();
    expect(sourceState(source)).toBe("live");
    expect(sourceGroup(source)).toBe("live");
  });

  it("A-3: reads a current one-shot import as Imported once, never Live", () => {
    for (const extra of [{}, { job: "pc.writer" }]) {
      const source = served("ani-food-orders", "current", {
        collection: "one_shot",
        ...extra,
      });
      const jobs: SourceJobs = new Map([["pc.writer", { state: "ok" }]]);
      expect(sourceState(source, jobs)).toBe("imported");
      expect(sourceGroup(source, jobs)).toBe("imported");
      expect(SOURCE_GROUPS[sourceGroup(source, jobs)]).toBe("Imported once");
    }
  });

  it("keeps an older reader's source (no status) exactly as before", () => {
    // No status reaches legacyState before any collection rule.
    const jobs: SourceJobs = new Map([
      ["pc.writer", { state: "ok" }],
      ["pc.snapshot", { state: "stale" }],
    ]);
    const cases: Array<[Record<string, unknown>, string, string]> = [
      [{ collection: "live" }, "live", "unjudged"],
      [{ collection: "live", job: "pc.writer" }, "live", "unjudged"],
      [{ collection: "live", job: "pc.snapshot" }, "live", "stale"],
      [{ collection: "one_shot" }, "imported", "imported"],
      [{ collection: "discovered" }, "discovered", "discovered"],
      [{ collection: "unknown" }, "unreported", "unreported"],
      [{}, "unreported", "unreported"],
    ];
    for (const [extra, group, state] of cases) {
      const source = row("ani-browsing", extra);
      expect(source.status).toBeNull();
      expect(sourceGroup(source, jobs), JSON.stringify(extra)).toBe(group);
      expect(sourceState(source, jobs), JSON.stringify(extra)).toBe(state);
    }
    expect(sourceGroup(empty("x", { collection: "unknown" }))).toBe(
      "discovered",
    );
  });

  it("keeps an older reader's groups as they were", () => {
    const jobs: SourceJobs = new Map([["pc.writer", { state: "ok" }]]);
    expect(sourceGroup(row("x", { collection: "live" }), jobs)).toBe("live");
    expect(
      sourceGroup(
        row("x", { collection: "live", job: "pc.snapshot" }),
        new Map([["pc.snapshot", { state: "stale" }]]),
      ),
    ).toBe("live");
    expect(sourceGroup(row("x", { collection: "one_shot" }))).toBe("imported");
    expect(sourceGroup(row("x", { collection: "discovered" }))).toBe(
      "discovered",
    );
    expect(sourceGroup(row("x"))).toBe("unreported");
    expect(sourceGroup(empty("x"))).toBe("discovered");
    // Never Live without System's current.
    expect(
      sourceState(row("x", { collection: "live", job: "pc.writer" }), jobs),
    ).toBe("unjudged");
  });

  it("A-3: shows ani-health as System serves it: Excluded, no records, nothing to open", () => {
    const health = parseSource({
      source_id: "ani-health",
      status: "excluded",
      // 0.14s before its first observation: read as given, never flagged.
      first_observed_at: "2026-09-22T17:44:54.119Z",
      last_observed_at: "2026-09-22T17:44:53.979Z",
      record_count: 0,
      revision_count: 92,
    })!;
    expect(health).toMatchObject({
      status: "excluded",
      records: 0,
      revisions: 92,
      unknownFields: [],
    });
    const [only] = sourceRows([health]);
    expect(only).toMatchObject({
      group: "excluded",
      state: "excluded",
      records: 0,
      revisions: 92,
      sourceId: null,
      lastSeen: null,
      lastSync: null,
    });
  });

  it("A-3: groups the live catalog's mix by System's word", () => {
    // Across all 49 live sources: partial 16, current 7, excluded 1,
    // pending 22, unavailable 3 (system#231); live 6, one_shot 16,
    // discovered 25, unknown 2 (system#236), where ani-health (excluded)
    // and manual (current) are unknown. The totals are the catalog's; how
    // the other statuses pair with collections here is synthetic, as are
    // the ids.
    const mix: Array<[string, string, number]> = [
      ["current", "live", 3],
      ["current", "one_shot", 3],
      ["current", "unknown", 1],
      ["partial", "live", 2],
      ["partial", "one_shot", 13],
      ["partial", "discovered", 1],
      ["pending", "discovered", 22],
      ["unavailable", "live", 1],
      ["unavailable", "discovered", 2],
      ["excluded", "unknown", 1],
    ];
    const count = (at: 0 | 1, value: string) =>
      mix
        .filter((item) => item[at] === value)
        .reduce((sum, item) => sum + item[2], 0);
    expect(
      ["partial", "current", "excluded", "pending", "unavailable"].map(
        (status) => count(0, status),
      ),
    ).toEqual([16, 7, 1, 22, 3]);
    expect(
      ["live", "one_shot", "discovered", "unknown"].map((collection) =>
        count(1, collection),
      ),
    ).toEqual([6, 16, 25, 2]);
    const sources = mix.flatMap(([status, collection, n]) =>
      Array.from({ length: n }, (_, index) =>
        served(`other-${status}-${collection}-${index}`, status, {
          connector: "other",
          collection,
        }),
      ),
    );
    const rows = sourceRows(sources);
    const tally = new Map<string, number>();
    for (const item of rows)
      tally.set(item.state, (tally.get(item.state) ?? 0) + 1);
    expect(Object.fromEntries(tally)).toEqual({
      live: 3,
      imported: 3,
      unjudged: 1,
      partial: 15,
      discovered: 23,
      unavailable: 3,
      excluded: 1,
    });
    expect([...new Set(rows.map((item) => SOURCE_GROUPS[item.group]))]).toEqual(
      [
        "Live",
        "Needs attention",
        "Connected",
        "Imported once",
        "Excluded",
        DISCOVERED_GROUP,
      ],
    );
    // Live holds only the three current sources System collects live: the
    // current one-shots are Imported once, and manual's shape is Connected.
    expect(rows.filter((item) => item.group === "live")).toHaveLength(3);
    expect(
      rows.filter((item) => item.group === "live").map((item) => item.state),
    ).toEqual(["live", "live", "live"]);
    expect(
      rows.filter(
        (item) => item.group === "connected" && item.state === "unjudged",
      ),
    ).toHaveLength(1);
    expect(rows.some((item) => item.group === "unreported")).toBe(false);
  });
});

describe("connector, device and lifecycle", () => {
  it.each([
    ["ani-browsing", "browsing"],
    ["ani-browsing-archive", "browsing"],
    ["ani-messages-1to1", "messages"],
    ["messages-mini", "messages"],
    ["ani-contacts", "contacts"],
    ["ani-contact-identity-map", "contacts"],
    ["ani-connection-graph", "contacts"],
    ["gmail-work", "mail"],
    ["calendar-work", "calendar"],
    ["notes-html-archive", "notes"],
    ["meeting-notes", "notes"],
    ["ani-ideas", "notes"],
    ["photos-pro", "media"],
    ["ani-voice-memos", "media"],
    ["claude-pro", "agent_transcripts"],
    ["codex-mini", "agent_transcripts"],
    ["ani-github-ledger", "code"],
    ["ani-health", "health"],
    ["brain-pro-vault", "legacy_vaults"],
    ["legacy-silver-mini", "legacy_vaults"],
    ["ani-food-orders", "other"],
    ["manual", "other"],
  ])("infers %s as %s from its id", (id, connector) => {
    expect(sourceConnector(row(id))).toBe(connector);
  });

  it("takes System's connector over the id", () => {
    expect(sourceConnector(row("gmail-work", { connector: "other" }))).toBe(
      "other",
    );
  });

  it("finds the device from System's host, else a device word", () => {
    expect(sourceHost(row("codex-mini"))).toBe("ap-mini");
    expect(sourceHost(row("brain-pro-vault"))).toBe("ap-pro");
    expect(sourceHost(row("ani-browsing"))).toBeNull();
    expect(sourceHost(row("ani-browsing", { host: "ap-pro" }))).toBe("ap-pro");
    expect(sourceHost(row("codex-mini", { host: "somewhere" }))).toBeNull();
  });

  it("A-4: treats a source with nothing recorded as discovered, never broken", () => {
    expect(sourceGroup(empty("gmail-work"))).toBe("discovered");
    expect(sourceState(empty("gmail-work"))).toBe("discovered");
    expect(sourceState(empty("gmail-work", { status: "unavailable" }))).toBe(
      "unavailable",
    );
  });

  it("A-3, A-4: never lets a count decide a lifecycle", () => {
    // Records but no word from System: not Connected, not Live.
    expect(sourceGroup(row("ani-contacts"))).toBe("unreported");
    expect(sourceState(row("ani-contacts"))).toBe("unreported");
    expect(SOURCE_GROUPS.unreported).toBe("Status not reported");
    // Enrolled but empty keeps System's lifecycle: never "not connected".
    const enrolled = empty("gmail-work", { status: "pending" });
    expect(sourceGroup(enrolled)).toBe("connected");
    expect(sourceGroup(empty("gmail-work", { collection: "live" }))).toBe(
      "live",
    );
    // System's own "discovered" wins over any count.
    expect(sourceGroup(row("gmail-work", { collection: "discovered" }))).toBe(
      "discovered",
    );
    expect(sourceGroup(row("gmail-work", { status: "discovered" }))).toBe(
      "discovered",
    );
  });

  it("A-7: reads System's nested store shape as unreported, never Connected or Live", () => {
    // System's store nests the catalog view under metadata; the reader
    // contract is flat, so none of it is read (ASK SYSTEM: flatten).
    const nested = parseSource({
      source_id: "ani-browsing",
      first_observed_at: ago(9000),
      last_observed_at: ago(30),
      record_count: 10,
      revision_count: 12,
      metadata: {
        display_name: "Browsing",
        connector: "browsing",
        collection: "live",
        status: "current",
        job: "pro.pc-send",
        last_success_at: ago(5),
      },
    })!;
    expect(nested).toMatchObject({
      collection: null,
      status: null,
      job: null,
      lastSuccessAt: null,
    });
    const [only] = sourceRows(
      [nested],
      new Map([["pro.pc-send", { state: "ok" }]]),
    );
    expect(only).toMatchObject({ group: "unreported", state: "unreported" });
    expect(["live", "connected"]).not.toContain(only!.state);
  });

  it("A-7: mirrors the job that collects a live source, and is Unjudged without one", () => {
    const jobs: SourceJobs = new Map([
      ["pro.pc-send", { state: "ok" }],
      ["pro.voicememos", { state: "ok" }],
      ["pc.snapshot", { state: "stale" }],
      ["pc.inference", { state: "failing" }],
      ["host.ap-pro", { state: "degraded" }],
      ["pro.whatsapp", { state: "asleep" }],
      ["health.ingest", { state: "unknown" }],
    ]);
    const live = (job: string | null, extra: Record<string, unknown> = {}) =>
      row("ani-browsing", {
        collection: "live",
        status: "current",
        ...(job ? { job } : {}),
        ...extra,
      });
    expect(sourceState(live("pro.voicememos"), jobs)).toBe("live");
    expect(sourceState(live("pc.snapshot"), jobs)).toBe("stale");
    expect(sourceState(live("pc.inference"), jobs)).toBe("failed");
    expect(sourceState(live("host.ap-pro"), jobs)).toBe("degraded");
    expect(sourceState(live("pro.whatsapp"), jobs)).toBe("asleep");
    // A current source that names no job has only System's word: Live.
    expect(sourceState(live(null), jobs)).toBe("live");
    // No snapshot, a job it does not list, or an unknown state: never Live.
    expect(sourceState(live("pro.pc-send"))).toBe("unjudged");
    expect(sourceState(live("pro.gone"), jobs)).toBe("unjudged");
    expect(sourceState(live("health.ingest"), jobs)).toBe("unjudged");
    // The newest record is a detail, never a freshness: a month-old one
    // under an ok job is Live, and a fresh one under no job is Unjudged.
    const old = live("pro.voicememos", { held_to: ago(60 * 24 * 31) });
    expect(sourceState(old, jobs)).toBe("live");
    expect(sourceState(live("pro.gone", { held_to: ago(1) }), jobs)).toBe(
      "unjudged",
    );
    const [shown] = sourceRows([old], jobs);
    expect(shown!.newest).toBe(ago(60 * 24 * 31));
  });

  // A-7: pro.pc-send's pass completes while Messages holds nothing past
  // 2024-05-19 (S-3, S-16); a multi-app pass never judges one source.
  it("A-7: never reads a source collected by pro.pc-send as Live, in any job state", () => {
    // System's catalog gives pro.pc-send to five live pro sources.
    const sources = [
      "ani-messages-1to1",
      "ani-browsing",
      "ani-browsing-archive",
      "ani-contacts",
      "ani-voice-memos",
    ].map((id) =>
      row(id, {
        connector: id.includes("messages")
          ? "messages"
          : id.includes("contacts")
            ? "contacts"
            : id.includes("voice")
              ? "media"
              : "browsing",
        job: "pro.pc-send",
        collection: "live",
        status: "current",
        held_to: "2024-05-19T00:00:00Z",
      }),
    );
    for (const state of ["ok", "degraded", "failing", "stale", "asleep"]) {
      const jobs: SourceJobs = new Map([["pro.pc-send", { state }]]);
      for (const source of sources)
        expect(sourceState(source, jobs), `${source.id} ${state}`).toBe(
          "unjudged",
        );
      for (const shown of sourceRows(sources, jobs))
        expect(shown.state).not.toBe("live");
    }
  });

  it("A-3: shows a sync time only from System's last_success_at, never the newest observation", () => {
    const [seen] = sourceRows([row("ani-food-orders")]);
    expect(seen).toMatchObject({ lastSync: null, lastSeen: ago(30) });
    const [synced] = sourceRows([
      row("ani-food-orders", { last_success_at: ago(5) }),
    ]);
    expect(synced).toMatchObject({ lastSync: ago(5), lastSeen: ago(30) });
  });

  it("A-3: puts an excluded source in its own group, whatever its counts say", () => {
    // ani-health as System served it before system#231 counted only
    // retrievable records.
    const health = row("ani-health", {
      record_count: 93,
      revision_count: 93,
      status: "excluded",
      connector: "health",
      host: "ap-mini",
    });
    expect(sourceGroup(health)).toBe("excluded");
    expect(sourceState(health)).toBe("excluded");
    const live = row("ani-health", {
      record_count: 93,
      status: "excluded",
      collection: "live",
      job: "health.ingest",
      last_success_at: ago(5),
    });
    expect(sourceGroup(live)).toBe("excluded");
    expect(
      sourceState(live, new Map([["health.ingest", { state: "ok" }]])),
    ).toBe("excluded");
    const [only] = sourceRows([live]);
    expect(only).toMatchObject({
      group: "excluded",
      state: "excluded",
      // Nothing to open, and no sync or observation to speak of: its last
      // observation can be the exclusion marker itself (S-20).
      sourceId: null,
      lastSync: null,
      lastSeen: null,
    });
  });

  it("names System's own states", () => {
    expect(sourceState(row("x", { status: "failed" }))).toBe("failed");
    expect(
      sourceState(row("x", { status: "paused", collection: "live" })),
    ).toBe("paused");
    expect(sourceState(row("x", { status: "excluded" }))).toBe("excluded");
    expect(sourceState(row("x", { status: "pending" }))).toBe("pending");
    expect(
      sourceState(row("x", { status: "current", collection: "live" })),
    ).toBe("live");
    expect(sourceState(row("x", { status: "partial" }))).toBe("partial");
    expect(sourceState(row("x", { collection: "one_shot" }))).toBe("imported");
  });

  it("keeps an excluded account out of a family in another group", () => {
    const rows = sourceRows([
      row("ani-contacts", { status: "current", collection: "live" }),
      row("contacts-work", { status: "current", collection: "live" }),
      row("contacts-nyu", { status: "excluded", collection: "live" }),
    ]);
    const family = rows.find((item) => item.kind === "family")!;
    expect(family.group).toBe("live");
    expect(family.state).toBe("live");
    expect(family.accounts).toHaveLength(2);
    expect(rows.find((item) => item.tooltip === "contacts-nyu")).toMatchObject({
      group: "excluded",
      state: "excluded",
      sourceId: null,
    });
  });
});

describe("rows by connector", () => {
  const catalog: DataSourceRow[] = [
    row("ani-browsing", {
      collection: "live",
      job: "pro.pc-send",
      last_success_at: ago(20),
      host: "ap-pro",
    }),
    row("ani-browsing-archive", { collection: "one_shot" }),
    row("ani-health", { status: "excluded", record_count: 93 }),
    row("ani-contacts"),
    row("ani-contact-identity-map"),
    row("ani-food-orders"),
    row("manual"),
    empty("gmail-work"),
    empty("gmail-school", { discovered_count: 12 }),
    empty("gmail-personal", { discovered_count: 3 }),
    empty("codex-mini"),
    empty("codex-pro"),
    empty("claude-pro"),
  ];
  const rows = sourceRows(catalog, new Map([["pro.pc-send", { state: "ok" }]]));

  it("groups by lifecycle with discovered last", () => {
    expect([...new Set(rows.map((item) => SOURCE_GROUPS[item.group]))]).toEqual(
      [
        "Live",
        "Imported once",
        "Status not reported",
        "Excluded",
        DISCOVERED_GROUP,
      ],
    );
  });

  it("folds one connector's accounts into one row", () => {
    const gmail = rows.find((item) => item.name === "Gmail")!;
    expect(gmail.kind).toBe("family");
    expect(gmail.tile?.id).toBe("gmail");
    expect(gmail.accounts.map((account) => account.name)).toEqual([
      "Personal",
      "School",
      "Work",
    ]);
    expect(gmail.discovered).toBe(15);
    expect(gmail.accounts.every((account) => account.sourceId)).toBe(true);
    const contacts = rows.find(
      (item) => item.group === "unreported" && item.connector === "contacts",
    )!;
    expect(contacts.kind).toBe("family");
    expect(contacts.records).toBe(20);
  });

  it("names accounts that differ only by device after the device", () => {
    const agents = rows.find((item) => item.connector === "agent_transcripts")!;
    expect(agents.name).toBe("Agent transcripts");
    expect(agents.tile).toBeNull();
    expect(agents.accounts.map((account) => account.name)).toEqual([
      "Claude",
      "Codex on ap-mini",
      "Codex on ap-pro",
    ]);
  });

  it("never folds sources of the Other family", () => {
    const other = rows.filter((item) => item.connector === "other");
    expect(other.map((item) => item.kind)).toEqual(["source", "source"]);
    expect(other.map((item) => item.name).sort()).toEqual([
      "Food orders",
      "Manual",
    ]);
  });

  it("A-27: keeps the owner and the device word out of names", () => {
    const live = rows.find((item) => item.group === "live")!;
    // Its job is pro.pc-send, a multi-app pass: Unjudged, never Live (A-7).
    expect(live).toMatchObject({
      name: "Browsing",
      device: "ap-pro",
      state: "unjudged",
    });
    expect(
      rows
        .flatMap((item) => [item, ...item.accounts])
        .some((item) => /\bani\b/i.test(item.name)),
    ).toBe(false);
  });

  it("gives every table row a unique key", () => {
    const keys = rows.flatMap((item) => [
      item.key,
      ...item.accounts.map((a) => a.key),
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("the catalogs this view renders", () => {
  // Committed fixtures only: a live capture never feeds a committed test.
  const catalogs: Array<[string, unknown[]]> = [
    ["synthetic fixture", dataFixture.sources],
  ];

  it("counts at least the records the synthetic fixture carries per source", () => {
    const carried = new Map<string, number>();
    for (const record of dataFixture.records) {
      const id = (record as { source_id?: string }).source_id;
      if (id) carried.set(id, (carried.get(id) ?? 0) + 1);
    }
    for (const source of dataFixture.sources as Array<{
      source_id: string;
      record_count: number;
      revision_count: number;
    }>) {
      const records = carried.get(source.source_id) ?? 0;
      expect(source.record_count, source.source_id).toBeGreaterThanOrEqual(
        records,
      );
      expect(source.revision_count, source.source_id).toBeGreaterThanOrEqual(
        source.record_count,
      );
    }
  });

  it.each(catalogs)("resolves every %s source to a row", (_name, items) => {
    const sources = items.map((item) => parseSource(item)!);
    expect(sources.every(Boolean)).toBe(true);
    const rows = sourceRows(sources);
    const listed = rows.flatMap((item) =>
      item.kind === "family" ? item.accounts : [item],
    );
    expect(listed.map((item) => item.tooltip).sort()).toEqual(
      sources.map((source) => source.id).sort(),
    );
    // Nothing with no records reads as broken unless System says so.
    for (const item of listed.filter((entry) => entry.group === "discovered"))
      expect(["discovered", "unavailable"]).toContain(item.state);
    for (const item of listed) expect(item.name.trim()).not.toBe("");
  });
});
