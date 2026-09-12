import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Draft } from "../editorial/draft-store";
import {
  inventoryChangedFields,
  editorialInventoryGroups,
  editorialInventorySearch,
  projectEditorialInventory,
  readInventoryDrafts,
  type InventoryEntry,
} from "./editorial-inventory-projection";
const entries: InventoryEntry[] = [
  {
    collection: "writing",
    id: "post",
    data: {
      title: "Published title",
      summary: "Published summary",
      status: "published",
    },
  },
  { collection: "home", id: "home", data: { title: "Home" } },
  {
    collection: "projects",
    id: "project",
    data: { title: "Project", public_state: "listed" },
  },
];
function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    key: "content/public/writing/post.md",
    source:
      "---\ntitle: Private title\nsummary: Private summary\nstatus: draft\n---\nBody",
    baseCommit: "a".repeat(40),
    baseFileHash: "b".repeat(40),
    revision: 2,
    updatedAt: 1_000,
    discardedAt: null,
    ...overrides,
  };
}
describe("editorial inventory projection", () => {
  it("overlays a private title without replacing published state/provenance or duplicating records", () => {
    const published = { at: "2025-01-01T00:00:00Z", source: "git" as const };
    const records = projectEditorialInventory(
      entries,
      [draft()],
      () => published,
    );
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({
      title: "Private title",
      summary: "Private summary",
      status: "published",
      intendedVisibility: "draft",
      changesPending: true,
      privateRevision: 2,
      publishedUpdated: published,
      updated: { source: "private" },
      href: "/content/writing/post",
    });
    expect(editorialInventorySearch(records)[0]).toMatchObject({
      label: "Private title",
      href: records[0]!.href,
    });
    expect(JSON.stringify(records)).not.toContain("baseCommit");
    expect(JSON.stringify(records)).not.toContain("---");
  });
  it("does not call a retained draft pending when source equals its published Git blob", () => {
    const d = draft();
    const bytes = Buffer.from(d.source);
    d.baseFileHash = createHash("sha1")
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest("hex");
    expect(projectEditorialInventory(entries, [d])[0]!.changesPending).toBe(
      false,
    );
  });
  it("keeps malformed and empty-title drafts discoverable using published metadata", () => {
    expect(
      projectEditorialInventory(entries, [
        draft({ source: "---\ntitle: [\n---" }),
      ])[0],
    ).toMatchObject({
      title: "Published title",
      summary: "Published summary",
      changesPending: true,
    });
    expect(
      projectEditorialInventory(entries, [
        draft({ source: '---\ntitle: ""\nsummary: ""\n---' }),
      ])[0],
    ).toMatchObject({ title: "Published title", summary: "" });
  });
  it("adds valid private-only writing and rejects discarded or invalid identities", () => {
    const result = projectEditorialInventory(entries, [
      draft({ key: "content/public/writing/new-post.md", baseFileHash: null }),
      draft({ key: "content/public/writing/deleted.md", discardedAt: 2 }),
      draft({ key: "content/public/writing/../evil.md" }),
    ]);
    expect(result).toHaveLength(4);
    expect(result.at(-1)).toMatchObject({
      id: "new-post",
      status: "draft",
      changesPending: true,
    });
  });
  it("uses latest revision and overlays page/project snapshots without changing grouping", () => {
    const result = projectEditorialInventory(entries, [
      draft({ revision: 1 }),
      draft({ revision: 3, source: "---\ntitle: Latest\n---" }),
      draft({
        key: "content/public/pages/home.md",
        source: "---\ntitle: Private home\n---",
      }),
    ]);
    expect(result[0]!.title).toBe("Latest");
    expect(
      editorialInventoryGroups(result)
        .find((group) => group.name === "website")!
        .records.map((record) => record.title),
    ).toEqual(["Private home"]);
    expect(
      editorialInventoryGroups(result)
        .find((group) => group.name === "work")!
        .records.map((record) => record.id),
    ).toEqual(["project"]);
  });
  it("keeps successes on partial snapshot failures without requesting history or media", async () => {
    const requested: string[] = [];
    const result = await readInventoryDrafts(entries, {
      listWritingDrafts: async () => [draft()],
      get: async (record) => {
        requested.push(`${record.kind}:${record.id}`);
        if (record.id === "project") throw Error("offline");
        return draft({ key: "content/public/pages/home.md" });
      },
    });
    expect(result.unavailable).toBe(true);
    expect(result.drafts).toHaveLength(2);
    expect(requested).toEqual(["page:home", "work:project"]);
  });
  it("preserves non-writing snapshots when writing inventory is unavailable", async () => {
    const result = await readInventoryDrafts(entries, {
      listWritingDrafts: async () => {
        throw Error("offline");
      },
      get: async () => null,
    });
    expect(result).toEqual({ drafts: [], unavailable: true });
    expect(projectEditorialInventory(entries, result.drafts)).toHaveLength(3);
  });
});

it("summarizes title, subtitle, body, visibility, tags and other property changes without source", () => {
  const entry: InventoryEntry = {
    collection: "writing",
    id: "post",
    body: "Original body\n",
    data: {
      title: "Original",
      summary: "Original summary",
      status: "published",
      published_at: new Date("2026-01-01"),
      tags: ["old"],
      content_type: "article",
    },
  };
  const records = projectEditorialInventory(
    [entry],
    [
      draft({
        source:
          "---\ntitle: Revised\nsummary: Revised summary\nstatus: draft\npublished_at: 2026-01-01\ntags: [new]\ncontent_type: note\n---\nNew body\n",
      }),
    ],
  );
  expect(records[0]!.changedFields).toEqual([
    "Title",
    "Subtitle",
    "Body",
    "Visibility",
    "Tags",
    "Properties",
  ]);
  expect(JSON.stringify(records[0]!.changedFields)).not.toContain("New body");
});
it("does not mistake YAML formatting, schema defaults, date coercion or CRLF for field changes", () => {
  const entry: InventoryEntry = {
    collection: "writing",
    id: "post",
    body: "Same body\n",
    data: {
      title: "Same",
      summary: "Summary",
      status: "published",
      published_at: new Date("2026-01-01"),
      tags: [],
      content_type: "article",
    },
  };
  const record = projectEditorialInventory(
    [entry],
    [
      draft({
        source:
          '---\r\nsummary: "Summary"\r\npublished_at: 2026-01-01T00:00:00Z\r\nstatus: published\r\ntitle: "Same"\r\n---\r\nSame body\r\n',
      }),
    ],
  )[0]!;
  expect(record.changesPending).toBe(true);
  expect(record.changedFields).toEqual([]);
});
it("does not guess missing body comparison or list every field for a private-only draft", () => {
  const entry: InventoryEntry = {
    collection: "writing",
    id: "post",
    data: {
      title: "Same",
      summary: "Summary",
      status: "draft",
      tags: [],
      content_type: "article",
    },
  };
  const source = "---\ntitle: Same\nsummary: Summary\n---\nUnknown body";
  expect(
    projectEditorialInventory([entry], [draft({ source })])[0]!.changedFields,
  ).toBeUndefined();
  expect(
    projectEditorialInventory([], [draft({ source })])[0]!.changedFields,
  ).toBeUndefined();
  expect(
    projectEditorialInventory([entry], [draft({ source: "broken" })])[0]!
      .changedFields,
  ).toBeUndefined();
});
it("recognizes meaningful Markdown formatting as a body change", () => {
  const entry: InventoryEntry = {
    collection: "writing",
    id: "post",
    body: "Same body",
    data: {
      title: "Same",
      summary: "Summary",
      status: "draft",
      tags: [],
      content_type: "article",
    },
  };
  expect(
    projectEditorialInventory(
      [entry],
      [
        draft({
          source: "---\ntitle: Same\nsummary: Summary\n---\n**Same body**",
        }),
      ],
    )[0]!.changedFields,
  ).toEqual(["Body"]);
});

it("identifies nested homepage copy and visibility without calling them generic properties", () => {
  const section = { visible: true, label: "Section", heading: "Heading" };
  const previous = {
    sections: {
      intro: { ...section, subheading: "Original subtitle" },
      past_work: section,
      latest_thoughts: section,
    },
    section_order: ["intro", "past_work", "latest_thoughts"],
    mentions: {},
  };
  const next = {
    ...previous,
    sections: {
      ...previous.sections,
      intro: {
        ...previous.sections.intro,
        heading: "New heading",
        subheading: "New subtitle",
      },
      past_work: { ...section, visible: false },
    },
  };
  // JSON object syntax is valid YAML and keeps this fixture independent of serializer output.
  expect(
    inventoryChangedFields(
      { collection: "home", id: "home", data: previous, body: "" },
      `---\n${JSON.stringify(next)}\n---\n`,
    ),
  ).toEqual(["Title", "Subtitle", "Visibility"]);
});

it("projects private page and project summaries into the same search inventory while retaining newsletter draft state", () => {
  const records = projectEditorialInventory(
    [
      {
        collection: "projects",
        id: "demo",
        data: {
          title: "Demo",
          subtitle: "Old subtitle",
          public_state: "listed",
        },
      },
      {
        collection: "home",
        id: "home",
        data: { sections: { intro: { subheading: "Old home" } } },
      },
      {
        collection: "newsletterPage",
        id: "newsletter",
        data: {
          headline: "Newsletter",
          deck: "Original deck",
          status: "draft",
        },
      },
    ],
    [
      draft({
        key: "content/public/projects/demo.md",
        source: "---\ncard_copy: New project card\n---\n",
      }),
      draft({
        key: "content/public/pages/home.md",
        source:
          '---\nsections: {intro: {subheading: "New home introduction"}}\n---\n',
      }),
      draft({
        key: "content/public/pages/newsletter.md",
        source: "---\ndeck: New newsletter deck\n---\n",
      }),
    ],
  );
  expect(records.map((record) => record.summary)).toEqual([
    "New project card",
    "New home introduction",
    "New newsletter deck",
  ]);
  const search = editorialInventorySearch(records);
  expect(search.map((item) => item.keywords[2])).toEqual(
    records.map((record) => record.summary),
  );
  expect(records[2]!.status).toBe("draft");
});
