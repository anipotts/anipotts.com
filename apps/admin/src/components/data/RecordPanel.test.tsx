// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import data from "../../fixtures/data_v1.synthetic.json";
import { DataTable } from "../workspace/Workspace";
import { parseRecord, type DataRecord } from "./data-model";
import { RecordPanel } from "./RecordPanel";
import { recordColumns } from "./RecordsView";

const records = data.records.map((record) => parseRecord(record)!);
const byKind = (kind: string) =>
  records.find((record) => record.kind === kind)!;

function panel(record: DataRecord) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    <RecordPanel
      record={record}
      busy={false}
      failure={null}
      onMore={() => {}}
      onClose={() => {}}
    />,
  );
  return host;
}

describe("the record panel", () => {
  it("leads with the body as lists, then one row of facts", () => {
    const host = panel(byKind("browsing_day"));
    expect(host.querySelector("h1")?.textContent).toBe("Browsing, Sep 21");
    const summary = host.querySelector(".data-record-summary")!;
    expect(summary.querySelector("p")?.textContent).toMatch(
      /^Browsing on Sep 21/,
    );
    expect(summary.querySelectorAll("ul li")).toHaveLength(7);
    const facts = host.querySelector('[aria-label="Record facts"]')!;
    // Source app, device, date and tier.
    expect(facts.querySelector('[data-mark="chrome"]')).not.toBeNull();
    expect(facts.querySelector('[data-mark="ap-pro"]')).not.toBeNull();
    expect(facts.textContent).toContain("Sep 21, 2026");
    expect(facts.querySelector('[aria-label="Intimate tier"]')).not.toBeNull();
  });

  it("shows browser visits as app tiles with visit counts", () => {
    const host = panel(byKind("browsing_day"));
    const chips = host.querySelector('[aria-label="Browser visits"]')!;
    expect(
      [...chips.querySelectorAll("li")].map((chip) => chip.textContent),
    ).toEqual(["44 visits", "2 visits", "1 visit"]);
    expect(chips.querySelector('[data-mark="chatgpt-atlas"]')).not.toBeNull();
  });

  it("never shows raw JSON, ISO times or an owner-named label", () => {
    for (const record of records) {
      const host = panel(record);
      const text = host.textContent ?? "";
      expect(text, record.kind!).not.toMatch(/[{}]|"\w+":/);
      expect(text, record.kind!).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
      for (const dt of host.querySelectorAll("dt"))
        expect(dt.textContent).not.toMatch(/\bAni\b/);
    }
  });

  it("keeps technical fields collapsed and the history in view", () => {
    const host = panel(byKind("browsing_day"));
    const technical = host.querySelector(".workspace-technical")!;
    expect(technical.textContent).toContain("Technical");
    expect(
      technical.querySelector("[aria-expanded]")?.getAttribute("aria-expanded"),
    ).toBe("false");
    // Its values are short, each with a copy button.
    expect(
      technical.querySelector('[aria-label="Copy source version"]'),
    ).not.toBeNull();
    const history = host.querySelector('[aria-label="Revision history"]')!;
    expect(
      [...history.querySelectorAll(".workspace-timeline-title")].map(
        (title) => title.textContent,
      ),
    ).toEqual(["Revision 3", "Revision 2", "Revision 1"]);
    expect(
      history.querySelectorAll('[aria-label="Copy source version"]'),
    ).toHaveLength(3);
  });
});

describe("record rows", () => {
  function table(options: Partial<Parameters<typeof recordColumns>[0]> = {}) {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      <DataTable
        rows={records}
        rowKey="id"
        label="Records"
        noun={["record", "records"]}
        footer={false}
        columns={recordColumns({ href: (row) => `/r/${row.id}`, ...options })}
      />,
    );
    return host;
  }
  const headers = (host: HTMLElement) =>
    [...host.querySelectorAll("thead th")].map((th) => th.textContent);

  it("is one row of aligned columns: record, source, state and time", () => {
    const host = table();
    expect(headers(host)).toEqual(["Record", "Source", "State", "Occurred"]);
    const row = host
      .querySelector(`a[href="/r/${byKind("browsing_day").id}"]`)!
      .closest("tr")!;
    // The app tile leads, the short title follows, the source has its device.
    expect(
      row.querySelector('.workspace-row-mark [data-mark="chrome"]'),
    ).not.toBeNull();
    expect(row.querySelector(".workspace-row-title")?.textContent).toBe(
      "Browsing, Sep 21",
    );
    const cells = row.querySelectorAll("td");
    expect(cells[1]?.textContent).toContain("Synthetic browsing");
    // The tier glyph sits in the state column, with any chip before it.
    expect(cells[2]?.querySelector(".workspace-tier")).not.toBeNull();
  });

  it("dates each row by when it occurred, the key the reader sorts by (A-28)", () => {
    const host = table();
    const time = (record: DataRecord) =>
      host
        .querySelector(`a[href="/r/${record.id}"]`)!
        .closest("tr")!
        .querySelector("td:last-child time")!;
    // A day, a month and a year read at their own precision.
    const month = records.find((row) => row.datePrecision === "month")!;
    expect(time(month).textContent).toMatch(/^[A-Z][a-z]{2} \d{4}$/);
    expect(time(month).getAttribute("title")).toMatch(/^Occurred: /);
    const year = records.find((row) => row.occurredAt === "2025")!;
    expect(time(year).textContent).toBe("2025");
    // A record System holds no occurred date for shows its observed time,
    // where System's order puts it, muted and named as observed.
    const undated = records.find((row) => !row.occurredAt)!;
    expect(time(undated).hasAttribute("data-observed")).toBe(true);
    expect(time(undated).getAttribute("title")).toMatch(
      /^Observed: .*No occurred date$/,
    );
  });

  it("keeps the device's place on a phone's line 2, so sources line up", () => {
    const host = table();
    const lines = [
      ...host.querySelectorAll(".workspace-row-meta .data-source"),
    ];
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines)
      expect(line.firstElementChild?.className).toBe("data-source-device");
  });

  it("puts a state other than the default before the tier", () => {
    const host = table();
    const superseded = records.find((row) => row.status === "superseded")!;
    const cell = host
      .querySelector(`a[href="/r/${superseded.id}"]`)!
      .closest("tr")!
      .querySelectorAll("td")[2]!;
    expect(cell.textContent).toContain("Superseded");
    expect(cell.lastElementChild?.lastElementChild?.className).toBe(
      "workspace-tier",
    );
  });

  it("drops the source beside an open record, or when one source is shown", () => {
    expect(headers(table({ beside: true }))).toEqual([
      "Record",
      "State",
      "Occurred",
    ]);
    expect(headers(table({ hideSource: true }))).toEqual([
      "Record",
      "State",
      "Occurred",
    ]);
  });
});
