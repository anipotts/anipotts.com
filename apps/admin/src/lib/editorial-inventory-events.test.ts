import { describe, expect, it } from "vitest";
import {
  applyEditorialRecordSaved,
  createInventoryView,
  parseEditorialRecordSaved,
  type EditorialRecordSaved,
} from "./editorial-inventory-events";
const row = {
  id: "post",
  collection: "writing",
  title: "Old",
  summary: "Old summary",
  href: "/content/writing/post",
  status: "published",
  privateRevision: 4,
  changesPending: true,
};
const search = {
  id: "content:writing:post",
  label: "Old",
  domain: "content" as const,
  kind: "writing",
  href: row.href,
  currentFact: "published; changes pending",
  source: "content inventory",
  freshness: "old",
  keywords: [],
};
const initial = () =>
  createInventoryView(
    [{ name: "writing", href: "/content?group=writing", records: [row] }],
    [search],
  );
const event: EditorialRecordSaved = {
  record: { kind: "writing", id: "post" },
  title: "New",
  summary: "New summary",
  revision: 5,
  updatedAt: "2026-09-12T01:00:00Z",
  changesPending: true,
};
describe("acknowledged inventory events", () => {
  it("updates safe metadata in inventory and search while retaining status and stable URL", () => {
    const before = initial();
    const next = applyEditorialRecordSaved(before, event);
    expect(next.groups![0]!.records[0]).toMatchObject({
      title: "New",
      summary: "New summary",
      status: "published",
      href: row.href,
      privateRevision: 5,
    });
    expect(next.searchEntries![0]).toMatchObject({
      label: "New",
      currentFact: "published; changes pending",
      href: row.href,
    });
    expect(before.groups![0]!.records[0].title).toBe("Old");
  });
  it("ignores older, duplicate, malformed and unrelated events", () => {
    const before = initial();
    for (const value of [
      { ...event, revision: 4 },
      { ...event, revision: 3 },
      { ...event, revision: NaN },
      { ...event, updatedAt: "bad" },
      { ...event, record: { kind: "writing", id: "missing" } },
      { ...event, changesPending: "yes" },
    ])
      expect(applyEditorialRecordSaved(before, value)).toBe(before);
    const next = applyEditorialRecordSaved(before, event);
    expect(applyEditorialRecordSaved(next, event)).toBe(next);
  });
  it("never copies raw source or claims the draft was published", () => {
    const parsed = parseEditorialRecordSaved({
      ...event,
      source: "PRIVATE BODY",
      status: "published",
    })!;
    expect(parsed).not.toHaveProperty("source");
    expect(parsed).not.toHaveProperty("status");
    const next = applyEditorialRecordSaved(initial(), {
      ...event,
      changesPending: false,
    });
    expect(next.searchEntries![0].currentFact).toBe("published");
  });
  it("maps project record kind to projects collection and excludes operational results", () => {
    const href = "/content/projects/demo";
    const current = createInventoryView(
      [
        {
          name: "work",
          href: "/content?group=work",
          records: [{ ...row, href, id: "demo", collection: "projects" }],
        },
      ],
      [{ ...search, href, domain: "work" }],
    );
    const next = applyEditorialRecordSaved(current, {
      ...event,
      record: { kind: "work", id: "demo" },
    });
    expect(next.groups![0].records[0].title).toBe("New");
    expect(next.searchEntries![0].label).toBe("Old");
  });
});
