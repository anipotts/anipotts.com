export type RiskLevel = "low" | "medium" | "high";

export type ContentSurface =
  "homepage" | "projects" | "writing" | "newsletter" | "systems";
export type ContentEditability = "ready" | "needs_schema" | "needs_owner";

export type ContentInventoryItem = {
  id: string;
  surface: ContentSurface;
  title: string;
  source_ref: string;
  current_value: string;
  editability: ContentEditability;
  risk_level: RiskLevel;
  next_safe_action: string;
  required_authority: string[];
  proof_ids: string[];
};

export type ContentPreviewStatus =
  "draft" | "preview" | "needs approval" | "blocked";

export type ContentPreviewItem = {
  id: string;
  inventory_id: string;
  surface: ContentSurface;
  title: string;
  status: ContentPreviewStatus;
  risk_level: RiskLevel;
  source_ref: string;
  current_value: string;
  proposed_value: string;
  preview_route: string;
  authority_state: string;
  required_approval_ids: string[];
  proof_ids: string[];
  blocked_actions: string[];
  next_safe_action: string;
};

type D1Result<T = unknown> = {
  results?: T[];
  success?: boolean;
};

type D1PreparedStatement = {
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
};

export type ContentInventoryD1Database = {
  prepare(query: string): D1PreparedStatement;
};

export type PageContentInventoryRow = {
  id: string;
  page_key: string;
  version: number;
  published: boolean;
  field_count: number;
  fields: PageContentInventoryField[];
  source_backed_fields: string[];
  summary: string;
  source_ref: string;
  updated_at: string;
  updated_by: string | null;
};

export type PageContentInventoryField = {
  path: string;
  value: string;
  raw_value: string;
  kind: string;
};

export type PageContentInventoryReadState =
  | {
      mode: "ready";
      row_count: number;
      published_count: number;
      rows: PageContentInventoryRow[];
    }
  | {
      mode: "missing_db";
      row_count: number;
      published_count: number;
      rows: PageContentInventoryRow[];
    }
  | {
      mode: "read_failed";
      row_count: number;
      published_count: number;
      rows: PageContentInventoryRow[];
      error: string;
    };

type PageContentD1Row = {
  id: string;
  page_key: string;
  content: string;
  version: number | null;
  published: number | boolean | null;
  updated_at: string | null;
  updated_by: string | null;
};

export const contentInventorySource = {
  source_doc: "docs/content-admin-editor-brief.md",
  architecture_doc: "docs/admin-v2-architecture.md",
  mode: "canonical_source_plus_d1_drafts",
  generated_from:
    "canonical content/public source files and the generated Admin projection; D1 page_content rows remain draft and migration history",
};

export async function readPageContentInventoryStore(
  db: ContentInventoryD1Database | null | undefined,
): Promise<PageContentInventoryReadState> {
  if (!db) {
    return {
      mode: "missing_db",
      row_count: 0,
      published_count: 0,
      rows: [],
    };
  }

  try {
    const [rowCount, publishedCount, rows] = await Promise.all([
      countPageContentRows(db),
      countPageContentRows(db, "WHERE published = 1"),
      db
        .prepare(
          `SELECT
             id,
             page_key,
             content,
             version,
             published,
             updated_at,
             updated_by
           FROM page_content
           ORDER BY page_key ASC, published DESC, version DESC
           LIMIT 50`,
        )
        .all<PageContentD1Row>(),
    ]);

    return {
      mode: "ready",
      row_count: rowCount,
      published_count: publishedCount,
      rows: (rows.results ?? []).map(pageContentInventoryFromRow),
    };
  } catch (error) {
    return {
      mode: "read_failed",
      row_count: 0,
      published_count: 0,
      rows: [],
      error: error instanceof Error ? error.message : "unknown read failure",
    };
  }
}

export const contentInventory: ContentInventoryItem[] = [
  {
    id: "homepage.heading",
    surface: "homepage",
    title: "hero heading",
    source_ref:
      "content/public/pages/home.md sections.intro.heading, projected through @anipotts/content/public",
    current_value: "hi, i'm ani",
    editability: "ready",
    risk_level: "low",
    next_safe_action:
      "Draft the homepage content record through an audited operation before adding a save path.",
    required_authority: [],
    proof_ids: ["content.homepage.heading.source"],
  },
  {
    id: "homepage.summary",
    surface: "homepage",
    title: "hero summary",
    source_ref:
      "content/public/pages/home.md sections.intro.subheading, projected through @anipotts/content/public",
    current_value:
      "Homepage intro copy uses two readable sentences with structured mentions rendered inline.",
    editability: "ready",
    risk_level: "medium",
    next_safe_action:
      "Preview the summary edit before any publish path updates canonical public content.",
    required_authority: [],
    proof_ids: ["content.homepage.summary.source"],
  },
  {
    id: "homepage.mentions",
    surface: "homepage",
    title: "homepage mention metadata",
    source_ref:
      "content/public/pages/home.md mentions and sections.intro.mention_keys, projected through @anipotts/content/public",
    current_value:
      "Structured AI, YC F25, Our Bad Habit, Atlantic Records, and Business Insider labels, links, and local logo paths are now structured homepage content.",
    editability: "ready",
    risk_level: "medium",
    next_safe_action:
      "Preview inline label, link, and local logo-path edits before canonical public content changes.",
    required_authority: [],
    proof_ids: ["content.homepage.mentions.page-content"],
  },
  {
    id: "homepage.work_records",
    surface: "homepage",
    title: "homepage work records",
    source_ref:
      "content/public/projects/*.md homepage_placement and homepage_order",
    current_value:
      "Canonical work records select and order homepage experience and project cards without copying card content into the homepage page record.",
    editability: "ready",
    risk_level: "medium",
    next_safe_action:
      "Preview project-record placement changes before canonical public content changes.",
    required_authority: [],
    proof_ids: ["content.homepage.work-records.source"],
  },
  {
    id: "homepage.making_selection",
    surface: "homepage",
    title: "homepage making selection",
    source_ref: "content/public/pages/home.md sections.past_work",
    current_value:
      "Canonical homepage content controls the making label, limit, view-all link, and ordered project slugs.",
    editability: "ready",
    risk_level: "medium",
    next_safe_action:
      "Preview ordered project selections before changing canonical homepage content.",
    required_authority: [],
    proof_ids: ["content.homepage.making.page-content"],
  },
  {
    id: "homepage.writing_selection",
    surface: "homepage",
    title: "homepage writing selection",
    source_ref: "content/public/pages/home.md sections.latest_thoughts",
    current_value:
      "Canonical homepage content controls the writing label, limit, view-all link, and ordered writing slugs.",
    editability: "ready",
    risk_level: "medium",
    next_safe_action:
      "Preview ordered writing selections before changing canonical homepage content.",
    required_authority: [],
    proof_ids: ["content.homepage.writing.page-content"],
  },
  {
    id: "projects.card_fields",
    surface: "projects",
    title: "project card fields",
    source_ref: "content/public/projects/*.md",
    current_value:
      "title, subtitle, description, year, category, role, duration, status, visibility, sort order, links, and tags.",
    editability: "ready",
    risk_level: "low",
    next_safe_action:
      "Render markdown frontmatter in admin first; writes should remain gated behind content operation proposals.",
    required_authority: [],
    proof_ids: ["content.projects.frontmatter.schema"],
  },
  {
    id: "projects.index_copy",
    surface: "projects",
    title: "making index copy",
    source_ref: "content/public/pages/making.md",
    current_value:
      "The /making title, meta description, hero copy, and project bucket labels come from canonical content.",
    editability: "ready",
    risk_level: "low",
    next_safe_action:
      "Preview index and bucket copy changes before changing canonical content.",
    required_authority: [],
    proof_ids: ["content.projects.index.page-content"],
  },
  {
    id: "projects.archive_index_copy",
    surface: "projects",
    title: "project archive index copy",
    source_ref: "content/public/pages/projects.md",
    current_value:
      "The /projects title, meta description, hero copy, and /making link come from canonical content.",
    editability: "ready",
    risk_level: "low",
    next_safe_action:
      "Preview archive index copy changes before changing canonical content.",
    required_authority: [],
    proof_ids: ["content.projects.archive-index.page-content"],
  },
  {
    id: "projects.detail_body",
    surface: "projects",
    title: "project detail body",
    source_ref: "content/public/projects/*.md",
    current_value:
      "Project frontmatter and body are the public route source. Historical page_content rows remain available for Admin review.",
    editability: "ready",
    risk_level: "medium",
    next_safe_action:
      "Review changes in Admin before proposing a source-controlled canonical update because detail pages carry public claims.",
    required_authority: [],
    proof_ids: [
      "content.projects.body.schema",
      "content.projects.detail.page-content",
    ],
  },
  {
    id: "writing.frontmatter",
    surface: "writing",
    title: "writing frontmatter",
    source_ref: "content/public/writing/*.md",
    current_value:
      "title, summary, tags, status, dates, content type, project, and artifact fields are already schema-backed.",
    editability: "ready",
    risk_level: "low",
    next_safe_action:
      "Show published and draft rows read-only before proposing status or scheduling edits.",
    required_authority: [],
    proof_ids: ["content.writing.frontmatter.schema"],
  },
  {
    id: "writing.index_copy",
    surface: "writing",
    title: "writing index copy",
    source_ref: "content/public/pages/writing.md",
    current_value:
      "The /writing title, meta description, hero summary, and search placeholder come from canonical content.",
    editability: "ready",
    risk_level: "low",
    next_safe_action:
      "Preview index copy changes before changing canonical content.",
    required_authority: [],
    proof_ids: ["content.writing.index.page-content"],
  },
  {
    id: "writing.body",
    surface: "writing",
    title: "writing body",
    source_ref: "content/public/writing/*.md",
    current_value:
      "Writing frontmatter and body are the public route source. Historical page_content rows remain available for Admin review.",
    editability: "ready",
    risk_level: "medium",
    next_safe_action:
      "Review writing changes in Admin before proposing a source-controlled canonical update or any send path.",
    required_authority: [],
    proof_ids: [
      "content.writing.body.source",
      "content.writing.detail.page-content",
    ],
  },
  {
    id: "writing.claude_stats_link",
    surface: "writing",
    title: "systems essay link",
    source_ref: "content/public/writing/saturdays-are-for-claude-code.md",
    current_value:
      "The writing post links to /systems as the canonical agent-method route.",
    editability: "ready",
    risk_level: "low",
    next_safe_action:
      "Keep this as the canonical route unless the public navigation changes again.",
    required_authority: [],
    proof_ids: ["content.writing.systems-link.current"],
  },
  {
    id: "newsletter.subscribe_copy",
    surface: "newsletter",
    title: "subscribe block copy",
    source_ref: "content/public/pages/newsletter.md",
    current_value:
      "Headline, deck, CTA labels, response text, sender metadata, and archive copy come from canonical public content.",
    editability: "ready",
    risk_level: "medium",
    next_safe_action:
      "Review source-controlled drafts before any newsletter publish path runs.",
    required_authority: [],
    proof_ids: [
      "content.newsletter.page-content.source",
      "content.newsletter.component.defaults",
    ],
  },
  {
    id: "newsletter.archive_copy",
    surface: "newsletter",
    title: "newsletter archive copy",
    source_ref: "content/public/pages/newsletter_archive.md",
    current_value:
      "The /newsletter/archive title, meta description, section label, and hero summary come from canonical content.",
    editability: "ready",
    risk_level: "low",
    next_safe_action:
      "Preview archive copy changes before changing canonical content.",
    required_authority: [],
    proof_ids: ["content.newsletter.archive.page-content"],
  },
  {
    id: "newsletter.backfill",
    surface: "newsletter",
    title: "newsletter backfill candidates",
    source_ref:
      "docs/content-admin-editor-brief.md:newsletter backfill options",
    current_value:
      "Existing writing can seed newsletter planning, but nothing should auto-send from admin.",
    editability: "needs_owner",
    risk_level: "high",
    next_safe_action:
      "Keep as read-only planning until newsletter ownership and outbound-send authority are explicit.",
    required_authority: ["newsletter.publish.owner-decision"],
    proof_ids: ["content.newsletter.backfill.plan"],
  },
  {
    id: "systems.hero_copy",
    surface: "systems",
    title: "systems page copy",
    source_ref: "content/public/pages/systems.md",
    current_value:
      "The /systems title, description, hero, operating principles, featured writing, and public tools come from canonical content.",
    editability: "ready",
    risk_level: "medium",
    next_safe_action:
      "Preview systems copy changes before changing canonical content.",
    required_authority: [],
    proof_ids: ["content.systems.hero.page-content"],
  },
];

function countPageContentRows(
  db: ContentInventoryD1Database,
  clause = "",
): Promise<number> {
  return db
    .prepare(`SELECT COUNT(*) AS count FROM page_content ${clause}`)
    .first<{ count: number }>()
    .then((row) => Number(row?.count ?? 0));
}

function pageContentInventoryFromRow(
  row: PageContentD1Row,
): PageContentInventoryRow {
  const content = parseJsonObject(row.content);
  const fields = listLeafFields(content);
  return {
    id: row.id,
    page_key: row.page_key,
    version: Number(row.version ?? 1),
    published: row.published === true || row.published === 1,
    field_count: fields.length,
    fields,
    source_backed_fields: sourceBackedFields(row.page_key, content),
    summary: summarizePageContent(row.page_key, content),
    source_ref: `D1 page_content:${row.page_key}`,
    updated_at: row.updated_at ?? "",
    updated_by: row.updated_by,
  };
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function listLeafFields(
  value: unknown,
  path = "",
): PageContentInventoryField[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      listLeafFields(item, `${path}[${index}]`),
    );
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, item]) => listLeafFields(item, path ? `${path}.${key}` : key),
    );
  }

  if (value === undefined || value === null) {
    return [];
  }

  return [
    {
      path: path || "value",
      value: formatFieldValue(value),
      raw_value: formatRawFieldValue(value),
      kind: Array.isArray(value) ? "array" : typeof value,
    },
  ];
}

function formatFieldValue(value: unknown): string {
  if (typeof value === "string") {
    return value.length > 96 ? `${value.slice(0, 93)}...` : value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return JSON.stringify(value) ?? String(value);
}

function formatRawFieldValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return JSON.stringify(value, null, 2) ?? String(value);
}

function sourceBackedFields(
  pageKey: string,
  content: Record<string, unknown>,
): string[] {
  if (pageKey !== "home") {
    return [];
  }

  const gaps: string[] = [];

  if (!hasNestedField(content, ["sections", "intro", "subheading"])) {
    gaps.unshift("sections.intro.subheading");
  }

  if (!hasNestedField(content, ["sections", "intro", "mention_keys"])) {
    gaps.push("sections.intro.mention_keys");
  }

  if (
    !hasNestedField(content, ["sections", "latest_thoughts", "writing_slugs"])
  ) {
    gaps.push("sections.latest_thoughts.writing_slugs");
  }

  return gaps;
}

function hasNestedField(
  value: Record<string, unknown>,
  path: string[],
): boolean {
  let current: unknown = value;

  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return false;
    }
    const record = current as Record<string, unknown>;
    if (!(key in record)) {
      return false;
    }
    current = record[key];
  }

  return current !== undefined && current !== null;
}

function summarizePageContent(
  pageKey: string,
  content: Record<string, unknown>,
): string {
  if (pageKey === "newsletter") {
    return compactSummary([
      ["headline", content.headline],
      ["deck", content.deck],
      ["cta", content.cta_label],
    ]);
  }

  if (
    pageKey === "writing" ||
    pageKey === "making" ||
    pageKey === "projects" ||
    pageKey === "newsletter_archive" ||
    pageKey === "systems"
  ) {
    return compactSummary([
      ["title", content.hero_title ?? content.title],
      ["label", content.section_label],
      ["summary", content.hero_summary],
      ["panel", content.panel_copy],
      ["loop", summarizeArray(content.loop_cards)],
      ["tools", summarizeArray(content.public_tools)],
      ["link", content.hero_link_href],
      ["search", content.search_placeholder],
    ]);
  }

  const sections = content.sections;
  if (
    pageKey === "home" &&
    sections &&
    typeof sections === "object" &&
    !Array.isArray(sections)
  ) {
    const intro = (sections as Record<string, unknown>).intro;
    if (intro && typeof intro === "object" && !Array.isArray(intro)) {
      return compactSummary([
        ["heading", (intro as Record<string, unknown>).heading],
        ["subheading", (intro as Record<string, unknown>).subheading],
      ]);
    }
  }

  return Object.keys(content).slice(0, 6).join(", ") || "empty content object";
}

function compactSummary(fields: [string, unknown][]): string {
  const parts = fields
    .filter((field): field is [string, string] => typeof field[1] === "string")
    .map(([label, value]) => `${label}: ${value}`);
  return parts.join(" / ") || "no text fields";
}

function summarizeArray(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  return `${value.length} items`;
}

export const contentPreviewItems: ContentPreviewItem[] = [
  {
    id: "preview.homepage.summary.tighten",
    inventory_id: "homepage.summary",
    surface: "homepage",
    title: "tighten homepage summary",
    status: "preview",
    risk_level: "medium",
    source_ref:
      "content/public/pages/home.md sections.intro.subheading and mentions",
    current_value:
      "homepage intro copy as rendered from the published `home` content record or source fallback.",
    proposed_value:
      "i work on realtime agent systems and make content about how they work. i previously worked on real-time agent i/o at structured ai (YC F25) and our bad habit, an atlantic records venture, and business insider also covered my everyday workflow.",
    preview_route: "/",
    authority_state: "preview_only_no_write",
    required_approval_ids: [],
    proof_ids: [
      "content.homepage.summary.source",
      "admin.content.preview.local",
    ],
    blocked_actions: ["save content", "publish content", "deploy public site"],
    next_safe_action:
      "Review tone and layout in admin only; do not write this copy to a content store.",
  },
  {
    id: "preview.projects.card-summary",
    inventory_id: "projects.card_fields",
    surface: "projects",
    title: "normalize project card summary field",
    status: "draft",
    risk_level: "low",
    source_ref: "content/public/projects/*.md:subtitle",
    current_value:
      "Project cards currently use subtitle plus description, with `summary` reserved for future editor wording.",
    proposed_value:
      "Expose `summary` in admin while mapping it to existing markdown `subtitle` until the schema is renamed.",
    preview_route: "/making",
    authority_state: "model_only",
    required_approval_ids: [],
    proof_ids: ["content.projects.frontmatter.schema"],
    blocked_actions: ["rename markdown schema", "rewrite project files"],
    next_safe_action:
      "Keep as a model decision until a migration PR can update the public site schema safely.",
  },
  {
    id: "preview.writing.claude-link",
    inventory_id: "writing.claude_stats_link",
    surface: "writing",
    title: "replace stale claude stats link",
    status: "preview",
    risk_level: "low",
    source_ref: "content/public/writing/saturdays-are-for-claude-code.md",
    current_value:
      "You can see all of this on [my Claude stats page](/claude).",
    proposed_value:
      "You can see the broader agent method on [my systems page](/systems).",
    preview_route: "/writing/saturdays-are-for-claude-code",
    authority_state: "public_site_safe_lane_absorbed",
    required_approval_ids: [],
    proof_ids: ["content.writing.systems-link.current"],
    blocked_actions: ["deploy without checks"],
    next_safe_action: "Keep /systems as the canonical public-site route.",
  },
  {
    id: "preview.newsletter.copy-source",
    inventory_id: "newsletter.subscribe_copy",
    surface: "newsletter",
    title: "choose newsletter copy source",
    status: "preview",
    risk_level: "medium",
    source_ref: "content/public/pages/newsletter.md",
    current_value:
      "Newsletter copy comes from canonical repository content; D1 retains draft-operation history.",
    proposed_value:
      "Render canonical newsletter content in Admin and require an audited proposal before source changes.",
    preview_route: "/newsletter",
    authority_state: "source_truth_resolved_preview_only",
    required_approval_ids: [],
    proof_ids: [
      "content.newsletter.page-content.source",
      "content.newsletter.component.defaults",
    ],
    blocked_actions: [
      "save newsletter copy",
      "sync newsletter provider",
      "send email",
    ],
    next_safe_action:
      "Keep read-only until a content operation write route is audited and logged.",
  },
];
