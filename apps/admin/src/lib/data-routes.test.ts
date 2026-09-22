import { describe, expect, it } from "vitest";
import {
  READER_KINDS,
  dataKind,
  dataRecordHref,
  dataRecordsHref,
  dataRoute,
  dataSource,
  knowledgeEntityHref,
  knowledgeHref,
  knowledgeRedirect,
  lifeRedirect,
} from "./data-routes";
import { dataReadPath } from "../data/personal-context";

const url = (path: string) => new URL(path, "https://admin.invalid");
const id = "rec-0123456789abcdef0123456789abcdef";

describe("Data routes", () => {
  it("keeps only the supported kind filter", () => {
    expect(dataKind("people")).toBe("people");
    expect(dataKind("notes")).toBe("notes");
    expect(dataKind("person")).toBe("all");
    expect(dataKind("__proto__")).toBe("all");
    expect(dataKind(null)).toBe("all");
    expect(dataRecordsHref("places")).toBe("/data/records?kind=places");
    expect(dataRecordsHref()).toBe("/data/records");
  });

  it("filters by the reader's own kinds, events and notes included", () => {
    expect(READER_KINDS).toEqual([
      "person",
      "project",
      "place",
      "event",
      "note",
    ]);
    for (const kind of READER_KINDS)
      expect(dataReadPath({ method: "search", q: "", kind })).toContain(
        `kind=${kind}`,
      );
  });

  it("keeps a source filter only in the reader's id shape", () => {
    expect(dataSource("synthetic-contacts")).toBe("synthetic-contacts");
    expect(dataSource("apple.voice_memos")).toBe("apple.voice_memos");
    expect(dataSource("a/b")).toBeNull();
    expect(dataSource("x".repeat(81))).toBeNull();
    expect(dataRecordsHref({ kind: "people", source: "claude" })).toBe(
      "/data/records?kind=people&source=claude",
    );
  });

  it("names a record by its reader id and keeps the filters", () => {
    expect(dataRecordHref(id)).toBe(`/data/records/${id}`);
    expect(dataRecordHref(id, "projects")).toBe(
      `/data/records/${id}?kind=projects`,
    );
    expect(dataRecordHref(id, { source: "claude" })).toBe(
      `/data/records/${id}?source=claude`,
    );
  });

  it("links the life wiki by kind and entity", () => {
    expect(knowledgeHref()).toBe("/data/knowledge");
    expect(knowledgeHref("topic")).toBe("/data/knowledge?kind=topic");
    expect(knowledgeEntityHref("ent-robin")).toBe("/data/knowledge/ent-robin");
    expect(knowledgeEntityHref("ent-robin", "person")).toBe(
      "/data/knowledge/ent-robin?kind=person",
    );
  });

  it("reads the four sibling views and nothing else", () => {
    expect(dataRoute(url("/data/records?kind=events&source=claude"))).toEqual({
      view: "records",
      id: null,
      kind: "events",
      source: "claude",
    });
    expect(dataRoute(url(`/data/records/${id}/`))).toEqual({
      view: "records",
      id,
      kind: "all",
      source: null,
    });
    expect(dataRoute(url("/data/sources?view=health"))).toEqual({
      view: "sources",
    });
    expect(dataRoute(url("/data/health"))).toEqual({ view: "health" });
    expect(dataRoute(url("/data/knowledge"))).toEqual({
      view: "knowledge",
      id: null,
      kind: null,
    });
    expect(dataRoute(url("/data/knowledge?kind=place&q=x"))).toEqual({
      view: "knowledge",
      id: null,
      kind: "place",
    });
    expect(dataRoute(url("/data/knowledge?kind=decision"))).toEqual({
      view: "knowledge",
      id: null,
      kind: null,
    });
    expect(dataRoute(url("/data/knowledge/ent-robin?kind=person"))).toEqual({
      view: "knowledge",
      id: "ent-robin",
      kind: "person",
    });
    for (const path of [
      "/data",
      "/data/records/not-an-id",
      "/data/records/%E0%A4%A",
      `/data/records/${id}/history`,
      "/data/unknown",
      "/data/knowledge/a%2Fb",
      "/data/knowledge/-lead",
      `/data/knowledge/${"x".repeat(129)}`,
      "/data/knowledge/ent-robin/history",
    ])
      expect(dataRoute(url(path)), path).toBeNull();
  });

  it.each([
    [undefined, "/data/records"],
    ["overview", "/data/records"],
    ["people", "/data/records?kind=people"],
    ["projects", "/data/records?kind=projects"],
    ["places", "/data/records?kind=places"],
    ["timeline", "/data/records"],
    ["preview", "/data/records"],
    ["sources", "/data/sources"],
    ["health", "/data/health"],
    ["aesthetics", "/data/records"],
    ["anything-else", "/data/records"],
  ])("lands /life/%s on %s", (section, destination) => {
    expect(lifeRedirect(section)).toBe(destination);
  });

  it.each([
    [null, "/data/knowledge"],
    ["all", "/data/knowledge"],
    ["people", "/data/knowledge?kind=person"],
    ["person", "/data/knowledge?kind=person"],
    ["project", "/data/knowledge?kind=project"],
    ["place", "/data/knowledge?kind=place"],
    ["locations", "/data/knowledge?kind=place"],
    ["topic", "/data/knowledge?kind=topic"],
    ["decision", "/data/knowledge"],
    ["system", "/data/knowledge"],
    ["__proto__", "/data/knowledge"],
  ])("lands /knowledge?kind=%s on %s", (kind, destination) => {
    expect(knowledgeRedirect(kind)).toBe(destination);
  });
});
