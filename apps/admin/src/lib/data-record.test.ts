import { describe, expect, it } from "vitest";
import data from "../fixtures/data_v1.synthetic.json";
import {
  detailLabel,
  historyEntries,
  readableBlocks,
  recordDetails,
  summaryBlocks,
} from "./data-record";

const byKind = (kind: string) =>
  data.records.find((record) => record.kind === kind) as unknown as Record<
    string,
    unknown
  >;
const labels = (raw: Record<string, unknown>) =>
  recordDetails(raw).details.map((detail) => detail.label);
const technical = (raw: Record<string, unknown>) =>
  recordDetails(raw).technical.map((entry) => entry.label);

describe("record summaries", () => {
  it("reads a browsing day as a paragraph and two titled count lists", () => {
    const blocks = summaryBlocks(byKind("browsing_day").body as string);
    expect(blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "list",
      "list",
    ]);
    expect(blocks[1]).toMatchObject({ title: "Top domains" });
    expect(blocks[1]!.type === "list" && blocks[1]!.items[0]).toEqual({
      text: "github.com",
      figure: "21",
    });
    // A bracketed count at the end is a figure too.
    expect(blocks[2]).toMatchObject({
      title: "Page titles on allowlisted domains",
      items: [
        { text: "github.com: Sample pull request", figure: "3" },
        { text: "wikipedia.org: Sample article", figure: "2" },
      ],
    });
  });

  it("reads label lines as label pairs and bullets as a list", () => {
    expect(summaryBlocks(byKind("contact").body as string)[0]).toMatchObject({
      type: "fields",
      items: expect.arrayContaining([
        { label: "Organization", value: "Example Studio" },
      ]),
    });
    expect(summaryBlocks(byKind("note").body as string)).toEqual([
      {
        type: "paragraph",
        lines: [
          "Synthetic fixture text for the note preview. It is not a real record.",
        ],
      },
    ]);
    expect(summaryBlocks("Trip\n- one\n- two")).toEqual([
      { type: "paragraph", lines: ["Trip"] },
      {
        type: "list",
        title: null,
        ordered: false,
        items: [
          { text: "one", figure: null },
          { text: "two", figure: null },
        ],
      },
    ]);
  });

  it("never shows a JSON body as JSON", () => {
    const blocks = summaryBlocks(byKind("assertion").body as string);
    expect(blocks).toEqual([
      {
        type: "fields",
        items: [
          { label: "Preference", value: "mornings" },
          { label: "Since", value: "2026-05" },
        ],
      },
    ]);
    expect(summaryBlocks('"afternoons"')).toEqual([
      { type: "paragraph", lines: ["afternoons"] },
    ]);
    expect(summaryBlocks('{"a":{"b":1}}')).toEqual([
      { type: "fields", items: [{ label: "A b", value: "1" }] },
    ]);
  });

  it("writes dates in prose as people read them", () => {
    const [first] = readableBlocks(
      summaryBlocks("Browsing on 2026-09-21 (America/New_York): 47 visits."),
      Date.parse("2026-09-22T12:00:00Z"),
    );
    expect(first).toEqual({
      type: "paragraph",
      lines: ["Browsing on Sep 21 (America/New_York): 47 visits."],
    });
  });
});

describe("record details", () => {
  it("reads browsing metadata under human labels, chips included", () => {
    const { details } = recordDetails(byKind("browsing_day"));
    expect(details.map((detail) => detail.label)).toEqual([
      "Time zone",
      "Day",
      "Visits",
      "Domains",
      "Browser visits",
      "Profiles",
      "Dropped visits",
    ]);
    expect(
      details.find((detail) => detail.label === "Browser visits")?.value,
    ).toMatchObject({ type: "chips", field: "browser_visits", raw: false });
    expect(details.find((detail) => detail.label === "Day")?.value).toEqual({
      type: "text",
      text: "Complete",
    });
  });

  it("keeps ids, hashes, references and versions technical", () => {
    const raw = byKind("browsing_day");
    expect(technical(raw)).toEqual([
      "Record ID",
      "Revision ID",
      "Source ID",
      "Source record ID",
      "Source reference",
      "Source version",
      "Aggregation",
    ]);
    const version = recordDetails(raw).technical.find(
      (entry) => entry.label === "Source version",
    );
    expect(version?.value).toEqual({
      type: "copy",
      value: raw.source_version,
    });
    expect(labels(byKind("voice_memo"))).not.toContain("Content sha256");
    expect(technical(byKind("voice_memo"))).toEqual(
      expect.arrayContaining(["Content SHA-256", "Locator", "Recording file"]),
    );
  });

  it("shows coverage on a note only, as chips", () => {
    const note = data.records.find(
      (record) => record.kind === "note" && "metadata" in record,
    ) as unknown as Record<string, unknown>;
    expect(
      recordDetails(note).technical.find((entry) => entry.label === "Coverage"),
    ).toMatchObject({
      label: "Coverage",
      value: { type: "chips", value: { export_metadata: "Captured" } },
    });
    const other = {
      ...byKind("voice_memo"),
      metadata: { coverage: { export_metadata: "captured" } },
    };
    expect(technical(other)).not.toContain("Coverage");
    expect(labels(other)).not.toContain("Coverage");
  });

  it("formats units, flattens nested counts and skips what the panel shows", () => {
    const health = recordDetails(byKind("health_day")).details;
    expect(health.map((detail) => [detail.label, detail.value])).toEqual([
      ["Time zone", { type: "text", text: "America/New_York" }],
      ["Steps", { type: "figure", text: "8,412" }],
      ["Vitals", { type: "text", text: "No vitals collected" }],
    ]);
    expect(labels(byKind("work_day"))).toEqual([
      "Visibility",
      "Owner",
      "Time zone",
      "Merged PRs",
      "Commits",
      "Commits by author",
      "Commits by repo",
    ]);
    expect(labels(byKind("contact"))).toEqual([
      "Modified",
      "Full name",
      "Organization",
      "Job title",
    ]);
  });

  it("never shows a vital on a health day, whatever number the record holds", () => {
    const day = {
      kind: "health_day",
      metadata: {
        date: "2026-09-18",
        vitals: {
          steps: 8412,
          distance_m: 6200,
          sleep_h: 7.2,
          resting_hr_bpm: 56,
          avg_hr_bpm: 71,
          hrv_avg_ms: 48,
          weight_lbs: 172.4,
          body_fat_pct: 18,
          wrist_temp_delta_c: 0.2,
        },
      },
    };
    const details = recordDetails(day).details;
    expect(details.map((detail) => detail.label)).toEqual([
      "Steps",
      "Distance",
      "Vitals",
    ]);
    expect(details.at(-1)!.value).toEqual({
      type: "text",
      text: "No vitals collected",
    });
    expect(JSON.stringify(details)).not.toMatch(/bpm|lbs|°C|7\.2|48/);
    // Outside a health day a value in milliseconds reads with its unit
    // spaced, like "56 bpm".
    expect(
      recordDetails({ kind: "note", metadata: { latency_ms: 48 } }).details,
    ).toEqual([
      {
        key: "latency_ms",
        label: "Latency",
        value: { type: "figure", text: "48 ms" },
      },
    ]);
  });

  it("names an app value with its mark and an assertion by its authority", () => {
    const [platform] = recordDetails(byKind("conversation_message")).details;
    expect(platform).toMatchObject({
      label: "Platform",
      value: { type: "app", id: "claude" },
    });
    const details = recordDetails(byKind("assertion")).details;
    expect(details.map((detail) => [detail.label, detail.value])).toEqual([
      ["Predicate", { type: "text", text: "Meeting preference" }],
      ["Value", expect.objectContaining({ type: "chips" })],
      ["Authority", { type: "text", text: "Direct statement" }],
      ["Effective from", { type: "text", text: "May 2026" }],
    ]);
    expect(technical(byKind("assertion"))).toContain("Subject ID");
  });

  it("never leads a label with the owner's name", () => {
    expect(detailLabel("ani_browsing_days")).toBe("Browsing days");
    for (const record of data.records)
      for (const label of labels(record as unknown as Record<string, unknown>))
        expect(label).not.toMatch(/\bAni\b/);
  });
});

describe("record history", () => {
  const revisions = [
    { id: "b", version: "v2", observedAt: "2026-09-22T11:30:00Z" },
    { id: "a", version: "v1", observedAt: "2026-09-21T11:30:00Z" },
  ];

  it("numbers revisions from the oldest and marks the current one", () => {
    expect(historyEntries(revisions, "b", false)).toEqual([
      {
        id: "b",
        title: "Revision 2",
        at: "2026-09-22T11:30:00Z",
        hash: "v2",
        current: true,
      },
      {
        id: "a",
        title: "Revision 1",
        at: "2026-09-21T11:30:00Z",
        hash: "v1",
        current: false,
      },
    ]);
  });

  it("does not number a capped history", () => {
    expect(
      historyEntries(revisions, "b", true).map((entry) => entry.title),
    ).toEqual(["Revision", "Revision"]);
  });
});
