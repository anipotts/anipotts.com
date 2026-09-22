import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import dataFixture from "../../fixtures/data_v1.synthetic.json";
import { parseSource, type DataSourceRow } from "./data-model";
import {
  DISCOVERED_GROUP,
  SOURCE_GROUPS,
  sourceConnector,
  sourceGroup,
  sourceHost,
  sourceRows,
  sourceState,
  staleAfterMs,
} from "./sources-model";

const NOW = Date.parse("2026-09-22T12:00:00Z");
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
      intervalSeconds: null,
      lastSuccessAt: null,
    });
    expect(
      row("ani-browsing", {
        display_name: "Browsing",
        connector: "browsing",
        host: "ap-pro",
        collection: "live",
        status: "current",
        coverage: "imported_records_only",
        adapter: "browser_days",
        job: "pro.pc-send",
        transport: "launchd",
        launchd_label: "com.anipotts.system.pc-send",
        interval_s: 3600,
        discovered_count: 3,
        excluded_count: 1,
        failed_count: 0,
        last_success_at: ago(10),
        held_from: ago(9000),
        held_to: ago(10),
      }),
    ).toMatchObject({
      displayName: "Browsing",
      connector: "browsing",
      host: "ap-pro",
      collection: "live",
      status: "current",
      job: "pro.pc-send",
      intervalSeconds: 3600,
      discoveredCount: 3,
      lastSuccessAt: ago(10),
    });
  });

  it("reads a value outside System's vocabulary as absent, and ignores unknown fields", () => {
    const odd = row("gmail-work", {
      connector: "fax",
      collection: "sometimes",
      status: "great",
      interval_s: -5,
      host: "a b",
      path: "/Users/someone/private",
      notes: "anything",
    });
    expect(odd).toMatchObject({
      connector: null,
      collection: null,
      status: null,
      intervalSeconds: null,
      host: null,
    });
    expect(JSON.stringify(odd)).not.toContain("private");
    expect(sourceConnector(odd)).toBe("mail");
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

  it("treats a source with nothing recorded as discovered, never broken", () => {
    expect(sourceGroup(empty("gmail-work"))).toBe("discovered");
    expect(sourceState(empty("gmail-work"), NOW)).toBe("discovered");
    expect(
      sourceState(empty("gmail-work", { status: "unavailable" }), NOW),
    ).toBe("unavailable");
    expect(sourceGroup(row("ani-contacts"))).toBe("connected");
    expect(sourceState(row("ani-contacts"), NOW)).toBe("connected");
  });

  it("judges a live source against its own interval, and never without one", () => {
    const live = (minutes: number, interval_s?: number) =>
      row("ani-browsing", {
        collection: "live",
        last_success_at: ago(minutes),
        ...(interval_s ? { interval_s } : {}),
      });
    expect(staleAfterMs(3600)).toBe((7200 + 600) * 1000);
    expect(sourceState(live(60, 3600), NOW)).toBe("live");
    expect(sourceState(live(129, 3600), NOW)).toBe("live");
    expect(sourceState(live(131, 3600), NOW)).toBe("stale");
    // No interval from System: never judged stale.
    expect(sourceState(live(60 * 24 * 30), NOW)).toBe("live");
    // Without a success receipt the newest record stands in.
    expect(
      sourceState(
        row("ani-messages-1to1", {
          collection: "live",
          interval_s: 900,
          last_observed_at: ago(60 * 24 * 6),
        }),
        NOW,
      ),
    ).toBe("stale");
  });

  it("names System's own states", () => {
    expect(sourceState(row("x", { status: "failed" }), NOW)).toBe("failed");
    expect(
      sourceState(row("x", { status: "paused", collection: "live" }), NOW),
    ).toBe("paused");
    expect(sourceState(row("x", { status: "excluded" }), NOW)).toBe("excluded");
    expect(sourceState(row("x", { status: "pending" }), NOW)).toBe("pending");
    expect(sourceState(row("x", { collection: "one_shot" }), NOW)).toBe(
      "imported",
    );
  });
});

describe("rows by connector", () => {
  const catalog: DataSourceRow[] = [
    row("ani-browsing", {
      collection: "live",
      interval_s: 3600,
      last_success_at: ago(20),
      host: "ap-pro",
    }),
    row("ani-browsing-archive", { collection: "one_shot" }),
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
  const rows = sourceRows(catalog, NOW);

  it("groups by lifecycle with discovered last", () => {
    expect([...new Set(rows.map((item) => SOURCE_GROUPS[item.group]))]).toEqual(
      ["Live", "Connected", "Imported once", DISCOVERED_GROUP],
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
      (item) => item.group === "connected" && item.connector === "contacts",
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
      "Codex, ap-mini",
      "Codex, ap-pro",
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

  it("keeps the owner and the device word out of names", () => {
    const live = rows.find((item) => item.group === "live")!;
    expect(live).toMatchObject({
      name: "Browsing",
      device: "ap-pro",
      state: "live",
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
  const replay = new URL(
    "../../../.local/replay/data_sources_v1.json",
    import.meta.url,
  );
  const catalogs: Array<[string, unknown[]]> = [
    ["synthetic fixture", dataFixture.sources],
    ...(existsSync(replay)
      ? [
          [
            "local replay",
            (
              JSON.parse(readFileSync(replay, "utf8")) as {
                data: { items: unknown[] };
              }
            ).data.items,
          ] as [string, unknown[]],
        ]
      : []),
  ];

  it.each(catalogs)("resolves every %s source to a row", (_name, items) => {
    const sources = items.map((item) => parseSource(item)!);
    expect(sources.every(Boolean)).toBe(true);
    const rows = sourceRows(sources, NOW);
    const listed = rows.flatMap((item) =>
      item.kind === "family" ? item.accounts : [item],
    );
    expect(listed.map((item) => item.sourceId).sort()).toEqual(
      sources.map((source) => source.id).sort(),
    );
    // Nothing with no records reads as broken unless System says so.
    for (const item of listed.filter((entry) => entry.group === "discovered"))
      expect(["discovered", "unavailable"]).toContain(item.state);
    for (const item of listed) expect(item.name.trim()).not.toBe("");
  });
});
