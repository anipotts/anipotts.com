import { describe, expect, it } from "vitest";
import {
  applyEditorialRecordCreated,
  applyEditorialRecordSaved,
  parseEditorialRecordCreated,
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

  it("clears pending changes once the same revision reaches the website", () => {
    const saved = applyEditorialRecordSaved(initial(), {
      ...event,
      intendedVisibility: "scheduled",
    });
    expect(saved.groups?.[0]?.records[0]?.changesPending).toBe(true);
    const live = applyEditorialRecordSaved(saved, {
      ...event,
      changesPending: false,
      intendedVisibility: "scheduled",
      publishedAt: "2026-09-12T02:00:00Z",
    });
    const liveRow = live.groups?.[0]?.records[0];
    expect(liveRow).toMatchObject({
      changesPending: false,
      status: "scheduled",
      publishedUpdated: { at: "2026-09-12T02:00:00.000Z", source: "git" },
      updated: { at: "2026-09-12T02:00:00.000Z", source: "git" },
    });
    expect(live.searchEntries?.[0]?.currentFact).toBe("scheduled");
    // An older revision going live never replaces a newer saved row.
    const newer = applyEditorialRecordSaved(saved, { ...event, revision: 6 });
    expect(
      applyEditorialRecordSaved(newer, {
        ...event,
        changesPending: false,
        publishedAt: "2026-09-12T02:00:00Z",
      }),
    ).toBe(newer);
    // A published event can never claim pending changes.
    expect(
      parseEditorialRecordSaved({
        ...event,
        publishedAt: "2026-09-12T02:00:00Z",
      }),
    ).toBeNull();
  });

  it("inserts a created writing draft once, with its group count and palette entry", () => {
    const view = createInventoryView(
      [
        { name: "pages", href: "/content?group=pages", records: [row] },
        { name: "work", href: "/content?group=work", records: [] },
        { name: "writing", href: "/content?group=writing", records: [row] },
      ],
      [search],
    );
    const created = {
      record: { kind: "writing" as const, id: "fresh-draft" },
      title: "Fresh draft",
      summary: "",
      revision: 1,
      updatedAt: "2026-09-12T03:00:00Z",
    };
    const next = applyEditorialRecordCreated(view, created);
    expect(next.groups?.map((group) => group.records.length)).toEqual([
      2, 0, 2,
    ]);
    expect(next.groups?.[2]?.records[1]).toMatchObject({
      href: "/content/writing/fresh-draft",
      title: "Fresh draft",
      status: "draft",
      changesPending: true,
      privateRevision: 1,
      updated: { at: "2026-09-12T03:00:00.000Z", source: "private" },
    });
    expect(next.searchEntries?.at(-1)).toMatchObject({
      id: "content:writing:fresh-draft",
      label: "Fresh draft",
      href: "/content/writing/fresh-draft",
      currentFact: "draft; changes pending",
    });
    const again = applyEditorialRecordCreated(next, created);
    expect(again.groups?.map((group) => group.records.length)).toEqual([
      2, 0, 2,
    ]);
    expect(again.searchEntries).toHaveLength(2);
  });

  it("rejects created events for anything but a valid writing draft", () => {
    const created = {
      record: { kind: "writing", id: "fresh-draft" },
      title: "Fresh draft",
      summary: "",
      revision: 1,
      updatedAt: "2026-09-12T03:00:00Z",
    };
    expect(parseEditorialRecordCreated(created)).not.toBeNull();
    for (const bad of [
      { ...created, record: { kind: "work", id: "fresh-draft" } },
      { ...created, record: { kind: "writing", id: "../escape" } },
      { ...created, title: " " },
      { ...created, revision: 0 },
      {
        ...created,
        source: "---\ntitle: x\n---",
        publishedAt: "2026-09-12T03:00:00Z",
      },
      null,
    ])
      expect(parseEditorialRecordCreated(bad)).toBeNull();
  });
});
