import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Draft } from "../editorial/draft-store";
import {
  inventoryChangedFields,
  inventoryIdentity,
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
  it("reads the content store's publish time when it is newer than the last Git change", () => {
    const git = { at: "2026-09-08T12:00:00Z", source: "git" as const };
    const [record] = projectEditorialInventory(
      [
        {
          ...entries[0]!,
          published: true,
          publishedAt: "2026-09-21T15:00:00Z",
        },
      ],
      [],
      () => git,
    );
    expect(record).toMatchObject({
      updated: { at: "2026-09-21T15:00:00.000Z", source: "cms" },
      publishedUpdated: { at: "2026-09-21T15:00:00.000Z", source: "cms" },
    });
  });
  it("keeps a newer Git change over an older publish", () => {
    const git = { at: "2026-09-21T16:00:00Z", source: "git" as const };
    const [record] = projectEditorialInventory(
      [
        {
          ...entries[0]!,
          published: true,
          publishedAt: "2026-09-08T12:00:00Z",
        },
      ],
      [],
      () => git,
    );
    expect(record!.updated).toEqual(git);
  });
  it("keeps the private draft time while changes are pending over a newer publish", () => {
    const [record] = projectEditorialInventory(
      [
        {
          ...entries[0]!,
          published: true,
          publishedAt: "2026-09-21T15:00:00Z",
        },
      ],
      [draft({ updatedAt: Date.parse("2026-09-22T09:00:00Z") })],
    );
    expect(record).toMatchObject({
      updated: { at: "2026-09-22T09:00:00.000Z", source: "private" },
      publishedUpdated: { at: "2026-09-21T15:00:00.000Z", source: "cms" },
    });
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

it("bounds the entire inventory read while retaining completed snapshots and ignoring late results", async () => {
  vi.useFakeTimers();
  try {
    let finishWriting!: (value: Draft[]) => void;
    let rejectProject!: (error: Error) => void;
    const home = draft({ key: "content/public/pages/home.md" });
    const reading = readInventoryDrafts(entries, {
      listWritingDrafts: () =>
        new Promise<Draft[]>((resolve) => {
          finishWriting = resolve;
        }),
      get: async (record) =>
        record.id === "home"
          ? home
          : new Promise<Draft | null>((_, reject) => {
              rejectProject = reject;
            }),
    });
    let result: Awaited<typeof reading> | undefined;
    void reading.then((value) => {
      result = value;
    });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(result).toEqual({ drafts: [home], unavailable: true });
    finishWriting([draft()]);
    rejectProject(new Error("Late storage failure"));
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toEqual({ drafts: [home], unavailable: true });
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it("limits reads to four concurrently and never starts another batch after the deadline", async () => {
  vi.useFakeTimers();
  try {
    const pages = Array.from({ length: 12 }, (_, i) => ({
      collection: "projects",
      id: `project-${i}`,
      data: {},
    }));
    const get = vi.fn(() => new Promise<Draft | null>(() => {}));
    const reading = readInventoryDrafts(pages, {
      listWritingDrafts: async () => [],
      get,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(get).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await reading).toEqual({ drafts: [], unavailable: true });
    expect(get).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it("uses the same validated editor identities for every editable page family", () => {
  for (const [collection, id] of [
    ["home", "home"],
    ["workPage", "work"],
    ["writingPage", "writing"],
    ["systemsPage", "systems"],
    ["newsletterPage", "newsletter"],
  ]) {
    expect(inventoryIdentity({ collection, id })).toEqual({ kind: "page", id });
  }
  expect(
    inventoryIdentity({ collection: "workPage", id: "not-a-page" }),
  ).toBeNull();
});

it("lists private-only projects and routes them back to the project editor", async () => {
  const project = draft({
    key: "content/public/projects/new-project.md",
    baseFileHash: null,
    source:
      "---\ntitle: Private project\ndescription: Test only\npublic_state: hidden\n---\n",
  });
  const storage = {
    listWritingDrafts: async () => [],
    listProjectDrafts: async () => [project],
    get: async () => null,
  };
  const inventory = await readInventoryDrafts([], storage);
  expect(inventory.unavailable).toBe(false);
  const records = projectEditorialInventory([], inventory.drafts);
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    collection: "projects",
    id: "new-project",
    title: "Private project",
    status: "draft",
    href: "/content/projects/new-project",
    intendedVisibility: "hidden",
    changesPending: true,
  });
  expect(
    editorialInventoryGroups(records).find((group) => group.name === "work")
      ?.records,
  ).toHaveLength(1);
});

it("keeps homepage picker slugs tied to the public baseline rather than a private rename", () => {
  const records = projectEditorialInventory(
    [
      {
        collection: "writing",
        id: "post",
        data: { title: "Post", status: "published", slug: "public-address" },
      },
      {
        collection: "writing",
        id: "default-address",
        data: { title: "Default", status: "published" },
      },
    ],
    [
      draft({
        source:
          "---\ntitle: Private\nslug: private-address\nstatus: draft\n---\nBody",
      }),
    ],
  );
  expect(records[0]!.publishedSlug).toBe("public-address");
  expect(records[1]!.publishedSlug).toBe("default-address");
  const privateOnly = projectEditorialInventory([], [draft()]);
  expect(privateOnly[0]!.publishedSlug).toBeUndefined();
});
