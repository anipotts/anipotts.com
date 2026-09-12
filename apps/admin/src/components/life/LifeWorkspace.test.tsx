import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  LifeReadView,
  LifeRecord,
  LifeWorkspace,
  lifeSections,
} from "./LifeWorkspace";
import type { LifeResult } from "../../data/personal-context";
const result = (data: Record<string, unknown>): LifeResult => ({
  state: "ready",
  scope: "agent",
  observedAt: "2026-01-01",
  data,
});
const record = {
  record_id: "rec-fixture",
  revision_id: "rev-fixture",
  title: "Fixture record",
  body: "<script>fixture()</script>",
  source_id: "synthetic-source",
  occurred_at: null,
  observed_at: "2026-01-01",
  date_precision: "unknown",
  status: "provisional",
  temporal_status: "effective_date_unknown",
  current_as_of: null,
  tier: "restricted",
  provenance: { source_uri: "fixture://original" },
};
describe("Life response surfaces", () => {
  it("renders every disconnected section without claiming an empty or healthy source", () => {
    for (const section of Object.keys(
      lifeSections,
    ) as (keyof typeof lifeSections)[]) {
      const html = renderToStaticMarkup(
        <LifeWorkspace
          section={section}
          result={{ state: "disconnected", message: "fixture" }}
        />,
      );
      expect(html).toContain("Life is not connected yet");
      expect(html).not.toContain("No permitted records");
      expect(html).not.toContain("Nothing in Life needs a decision");
    }
  });
  it("renders People, Projects, Places and Timeline from record pages", () => {
    for (const section of [
      "people",
      "projects",
      "places",
      "timeline",
    ] as const) {
      const html = renderToStaticMarkup(
        <LifeReadView
          section={section}
          result={result({ items: [record], total: 1, next_offset: null })}
        />,
      );
      expect(html).toContain("Fixture record");
      expect(html).toContain("synthetic-source");
      expect(html).toContain("Date unknown");
      expect(html).toContain("provisional");
    }
  });
  it("shows source coverage without treating discovery as ingestion", () => {
    const html = renderToStaticMarkup(
      <LifeReadView
        section="sources"
        result={result({
          items: [
            {
              source_id: "synthetic-source",
              status: "pending",
              coverage: "discovery_only",
            },
          ],
          total: 1,
          next_offset: null,
        })}
      />,
    );
    expect(html).toContain("discovery_only");
    expect(html).toContain("pending");
  });
  it("shows unavailable wiki and unenrolled automatic capture on overview", () => {
    const html = renderToStaticMarkup(
      <LifeReadView
        section="overview"
        result={result({
          ingestion: { state: "ready", automatic_sources: "not_enrolled" },
          wiki: { available: false },
          last_change_at: null,
        })}
      />,
    );
    expect(html).toContain("Unavailable");
    expect(html).toContain("not_enrolled");
  });
  it("renders exact preview text, scope and token measurement", () => {
    const html = renderToStaticMarkup(
      <LifeReadView
        section="preview"
        result={result({
          context_text: "fixture context\nsecond line",
          token_count: 8,
          budget: 3000,
          token_measurement: "conservative_upper_bound",
          selected: [],
          omitted: [],
        })}
      />,
    );
    expect(html).toContain("fixture context\nsecond line");
    expect(html).toContain("agent");
    expect(html).toContain("conservative_upper_bound");
  });
  it("escapes source bodies and keeps temporal evidence and provenance visible", () => {
    const html = renderToStaticMarkup(<LifeRecord record={record} />);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>fixture()");
    for (const value of [
      "Unknown",
      "Not witnessed",
      "2026-01-01",
      "effective_date_unknown",
      "fixture://original",
      "restricted",
    ])
      expect(html).toContain(value);
  });
});
