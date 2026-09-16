import type { RiskLevel } from "./content";

export type ContentOperationKind =
  "content_record" | "content_draft" | "content_publish";

export type ContentOperationStatus =
  | "draft"
  | "previewed"
  | "needs_ani"
  | "blocked"
  | "approved"
  | "publishing"
  | "published"
  | "verified"
  | "reverted";

export type ContentOperationSurface = "public_site" | "newsletter" | "admin";

export type ContentOperation = {
  operation_id: string;
  kind: ContentOperationKind;
  surface: ContentOperationSurface;
  route: string;
  source_ref: string;
  field_path: string;
  current_value_ref: string;
  proposed_value: string;
  status: ContentOperationStatus;
  risk_level: RiskLevel;
  authority_state: string;
  required_approval_ids: string[];
  allowed_actions: string[];
  forbidden_actions: string[];
  preview_targets: string[];
  proof_ids: string[];
  evidence_uri?: string;
  redaction: string;
  created_by: "agent" | "ani" | "system";
  created_at: string;
  updated_at: string;
  expires_at?: string;
  rollback_ref: string;
  reviewer_note?: string;
};

type D1Result<T = unknown> = {
  results?: T[];
  success?: boolean;
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
};

export type ContentOperationD1Database = {
  prepare(query: string): D1PreparedStatement;
};

type ContentOperationRow = {
  operation_id: string;
  kind: string;
  surface: string;
  route: string;
  source_ref: string;
  field_path: string;
  current_value_ref: string;
  proposed_value: string;
  status: string;
  risk_level: string;
  authority_state: string;
  required_approval_ids: string;
  allowed_actions: string;
  forbidden_actions: string;
  preview_targets: string;
  proof_ids: string;
  evidence_uri: string | null;
  redaction: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  rollback_ref: string;
  reviewer_note: string | null;
};

export type ContentOperationCountRow = {
  table_name: ContentOperationTable["table"];
  rows: number;
};

export type ContentOperationReadState =
  | {
      mode: "ready";
      counts: ContentOperationCountRow[];
      operations: ContentOperation[];
    }
  | {
      mode: "missing_db";
      counts: ContentOperationCountRow[];
      operations: ContentOperation[];
    }
  | {
      mode: "read_failed";
      counts: ContentOperationCountRow[];
      operations: ContentOperation[];
      error: string;
    };

export type ContentOperationTable = {
  table:
    "content_records" | "content_draft_operations" | "content_publish_events";
  purpose: string;
  write_state: "schema_only" | "draft_save_only" | "publish_with_proof";
  blocked_actions: string[];
};

export const contentOperationSchemaSource = {
  source_doc: "docs/admin-content-draft-operations.md",
  migration:
    "drizzle/migrations/0007_content_operations.sql + drizzle/migrations/0008_seed_content_draft_operations.sql + drizzle/migrations/0011_seed_source_content_review_operations.sql + drizzle/migrations/0028_seed_listing_content_review_operations.sql + drizzle/migrations/0030_expand_orchestrating_page_content.sql + drizzle/migrations/0031_seed_detail_page_content.sql + drizzle/migrations/0032_seed_remaining_detail_page_content.sql + drizzle/migrations/0033_refresh_draft_operation_save_metadata.sql",
  schema: "packages/lib/src/db/schema.ts",
  mode: "d1_schema_with_passkey_draft_and_publish_proof",
};

export const contentOperationTables: ContentOperationTable[] = [
  {
    table: "content_records",
    purpose:
      "future published field overrides for public-site and newsletter copy",
    write_state: "schema_only",
    blocked_actions: ["browser save", "public-site runtime read", "publish"],
  },
  {
    table: "content_draft_operations",
    purpose:
      "draft and preview operations with authority, proof, rollback, and blocked action metadata",
    write_state: "draft_save_only",
    blocked_actions: ["direct source edit", "auto deploy", "publish"],
  },
  {
    table: "content_publish_events",
    purpose:
      "immutable proof trail for selected-draft publish and future rollback events",
    write_state: "publish_with_proof",
    blocked_actions: ["send", "schedule", "publish without selected draft"],
  },
];

export function contentOperationFallbackCounts(): ContentOperationCountRow[] {
  return contentOperationTables.map((table) => ({
    table_name: table.table,
    rows: 0,
  }));
}

export async function readContentOperationStore(
  db: ContentOperationD1Database | null | undefined,
): Promise<ContentOperationReadState> {
  const fallbackCounts = contentOperationFallbackCounts();
  if (!db) {
    return {
      mode: "missing_db",
      counts: fallbackCounts,
      operations: [],
    };
  }

  try {
    const [records, operations, events, recent] = await Promise.all([
      countRows(db, "content_records"),
      countRows(db, "content_draft_operations"),
      countRows(db, "content_publish_events"),
      db
        .prepare(
          `SELECT
             operation_id,
             kind,
             surface,
             route,
             source_ref,
             field_path,
             current_value_ref,
             proposed_value,
             status,
             risk_level,
             authority_state,
             required_approval_ids,
             allowed_actions,
             forbidden_actions,
             preview_targets,
             proof_ids,
             evidence_uri,
             redaction,
             created_by,
             created_at,
             updated_at,
             expires_at,
             rollback_ref,
             reviewer_note
           FROM content_draft_operations
           ORDER BY updated_at DESC
           LIMIT 20`,
        )
        .all<ContentOperationRow>(),
    ]);

    return {
      mode: "ready",
      counts: [
        { table_name: "content_records", rows: records },
        { table_name: "content_draft_operations", rows: operations },
        { table_name: "content_publish_events", rows: events },
      ],
      operations: (recent.results ?? []).map(contentOperationFromRow),
    };
  } catch (error) {
    return {
      mode: "read_failed",
      counts: fallbackCounts,
      operations: [],
      error: error instanceof Error ? error.message : "unknown read failure",
    };
  }
}

function countRows(
  db: ContentOperationD1Database,
  table: ContentOperationTable["table"],
): Promise<number> {
  return db
    .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
    .first<{ count: number }>()
    .then((row) => Number(row?.count ?? 0));
}

function contentOperationFromRow(row: ContentOperationRow): ContentOperation {
  return {
    operation_id: row.operation_id,
    kind: parseKind(row.kind),
    surface: parseSurface(row.surface),
    route: row.route,
    source_ref: row.source_ref,
    field_path: row.field_path,
    current_value_ref: row.current_value_ref,
    proposed_value: row.proposed_value,
    status: parseStatus(row.status),
    risk_level: parseRisk(row.risk_level),
    authority_state: row.authority_state,
    required_approval_ids: parseStringArray(row.required_approval_ids),
    allowed_actions: parseStringArray(row.allowed_actions),
    forbidden_actions: parseStringArray(row.forbidden_actions),
    preview_targets: parseStringArray(row.preview_targets),
    proof_ids: parseStringArray(row.proof_ids),
    evidence_uri: row.evidence_uri ?? undefined,
    redaction: row.redaction,
    created_by: parseCreatedBy(row.created_by),
    created_at: row.created_at,
    updated_at: row.updated_at,
    expires_at: row.expires_at ?? undefined,
    rollback_ref: row.rollback_ref,
    reviewer_note: row.reviewer_note ?? undefined,
  };
}

function parseStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function parseKind(value: string): ContentOperationKind {
  return value === "content_record" ||
    value === "content_draft" ||
    value === "content_publish"
    ? value
    : "content_draft";
}

function parseSurface(value: string): ContentOperationSurface {
  return value === "public_site" || value === "newsletter" || value === "admin"
    ? value
    : "public_site";
}

function parseStatus(value: string): ContentOperationStatus {
  return value === "draft" ||
    value === "previewed" ||
    value === "needs_ani" ||
    value === "blocked" ||
    value === "approved" ||
    value === "publishing" ||
    value === "published" ||
    value === "verified" ||
    value === "reverted"
    ? value
    : "draft";
}

function parseRisk(value: string): RiskLevel {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : "medium";
}

function parseCreatedBy(value: string): ContentOperation["created_by"] {
  return value === "agent" || value === "ani" || value === "system"
    ? value
    : "agent";
}

type DetailOperationSeed = {
  kind: "project" | "writing";
  slug: string;
  title: string;
  published: boolean;
  sourceFile: string;
};

const REMAINING_DETAIL_OPERATION_CREATED_AT = "2026-06-29T07:45:00Z";
const REMAINING_DETAIL_OPERATION_SEEDS: DetailOperationSeed[] = [
  {
    kind: "project",
    slug: "agents",
    title: "agents",
    published: true,
    sourceFile: "content/public/projects/agents.md",
  },
  {
    kind: "project",
    slug: "chainedchat",
    title: "chainedchat",
    published: true,
    sourceFile: "content/public/projects/chainedchat.md",
  },
  {
    kind: "project",
    slug: "habittracker-obh",
    title: "artist scouting dashboard",
    published: false,
    sourceFile: "content/public/projects/habittracker-obh.md",
  },
  {
    kind: "project",
    slug: "imessage-mcp",
    title: "imessage mcp",
    published: true,
    sourceFile: "content/public/projects/imessage-mcp.md",
  },
  {
    kind: "project",
    slug: "nyu-purity-test",
    title: "nyu purity test",
    published: true,
    sourceFile: "content/public/projects/nyu-purity-test.md",
  },
  {
    kind: "project",
    slug: "options-pricing-sensitivity",
    title: "options pricing + sensitivity analysis",
    published: true,
    sourceFile: "content/public/projects/options-pricing-sensitivity.md",
  },
  {
    kind: "project",
    slug: "pgi-research-platform",
    title: "pgi research portal",
    published: true,
    sourceFile: "content/public/projects/pgi-research-platform.md",
  },
  {
    kind: "project",
    slug: "quantercise-extension",
    title: "mental math extension",
    published: true,
    sourceFile: "content/public/projects/quantercise-extension.md",
  },
  {
    kind: "project",
    slug: "saeshify",
    title: "saeshify",
    published: true,
    sourceFile: "content/public/projects/saeshify.md",
  },
  {
    kind: "writing",
    slug: "i-built-a-monitor-for-my-claude-code-sessions",
    title: "i built a monitor for my claude code sessions",
    published: true,
    sourceFile:
      "content/public/writing/i-built-a-monitor-for-my-claude-code-sessions.md",
  },
  {
    kind: "writing",
    slug: "jpegmafia-is-our-kanye-west",
    title: "jpegmafia is our kanye west",
    published: false,
    sourceFile: "content/public/writing/jpegmafia-is-our-kanye-west.md",
  },
  {
    kind: "writing",
    slug: "search-will-be-dead-by-2030",
    title: "search will be dead by 2030",
    published: true,
    sourceFile: "content/public/writing/search-will-be-dead-by-2030.md",
  },
  {
    kind: "writing",
    slug: "stop-ending-your-day-with-fix-the-bug",
    title: 'stop ending your day with "fix the bug"',
    published: true,
    sourceFile:
      "content/public/writing/stop-ending-your-day-with-fix-the-bug.md",
  },
];

const remainingDetailContentOperationTemplates: ContentOperation[] =
  REMAINING_DETAIL_OPERATION_SEEDS.map(detailOperationFromSeed);

function detailOperationFromSeed(seed: DetailOperationSeed): ContentOperation {
  const collection = seed.kind === "project" ? "projects" : "writing";
  const pageKey = `${seed.kind}:${seed.slug}`;
  const route =
    seed.kind === "project" ? `/work/${seed.slug}` : `/writing/${seed.slug}`;
  const forbiddenActions =
    seed.kind === "project"
      ? ["save", "publish", "deploy", "rewrite_markdown", "sync_external"]
      : [
          "save",
          "publish",
          "send",
          "schedule",
          "rewrite_markdown",
          "sync_provider",
        ];

  return {
    operation_id: `content-draft-${seed.kind}-${seed.slug}-detail-2026-06-29`,
    kind: "content_draft",
    surface: "public_site",
    route,
    source_ref: seed.sourceFile,
    field_path: `${collection}.${seed.slug.replaceAll("-", "_")}.detail`,
    current_value_ref: `${seed.published ? "published" : "unpublished"}_canonical_source:${pageKey}`,
    proposed_value: `Review future edits to the ${seed.title} title, summary, body, links, tags, and visibility before proposing a source-controlled canonical update.`,
    status: "previewed",
    risk_level: seed.published ? "medium" : "low",
    authority_state: "canonical_source_preview_only_no_write",
    required_approval_ids: [],
    allowed_actions: ["render_preview", "request_review"],
    forbidden_actions: forbiddenActions,
    preview_targets: seed.published
      ? ["/content/review", "/content/preview", route]
      : ["/content/review", "/content/preview"],
    proof_ids: [
      `content.${collection}.${seed.slug.replaceAll("-", ".")}.page-content`,
      "admin.content.preview.d1",
    ],
    evidence_uri: `repo://${seed.sourceFile}`,
    redaction: "public_copy_only",
    created_by: "agent",
    created_at: REMAINING_DETAIL_OPERATION_CREATED_AT,
    updated_at: REMAINING_DETAIL_OPERATION_CREATED_AT,
    expires_at: "2026-07-29T07:45:00Z",
    rollback_ref: `source_markdown:${seed.sourceFile}`,
    reviewer_note: `${seed.published ? "Published" : "Unpublished"} canonical detail is projected as preview metadata. No source rewrite, external sync, send, schedule, or publish event is created.`,
  };
}

export const contentOperationTemplates: ContentOperation[] = [
  {
    operation_id: "content-draft-homepage-summary-2026-06-28",
    kind: "content_draft",
    surface: "public_site",
    route: "/",
    source_ref:
      "content/public/pages/home.md sections.intro.subheading projected through @anipotts/content/public",
    field_path: "homepage.summary",
    current_value_ref: "source_fallback",
    proposed_value:
      "previously worked on real-time agent i/o at structured ai (YC F25) and our bad habit, an atlantic records venture. now i write about coding agent workflows and the systems around them.",
    status: "previewed",
    risk_level: "medium",
    authority_state: "preview_only_no_write",
    required_approval_ids: [],
    allowed_actions: ["render_preview", "request_review"],
    forbidden_actions: ["save", "publish", "deploy", "send"],
    preview_targets: ["/content/preview", "/"],
    proof_ids: [
      "content.homepage.summary.source",
      "admin.content.preview.local",
    ],
    evidence_uri: "repo://apps/www/src/pages/index.astro",
    redaction: "public_copy_only",
    created_by: "agent",
    created_at: "2026-06-28T00:00:00Z",
    updated_at: "2026-06-28T00:00:00Z",
    expires_at: "2026-07-28T00:00:00Z",
    rollback_ref: "source_fallback",
  },
  {
    operation_id: "content-draft-newsletter-copy-2026-06-28",
    kind: "content_draft",
    surface: "newsletter",
    route: "/newsletter",
    source_ref: "content/public/pages/newsletter.md",
    field_path: "newsletter.subscribe_copy",
    current_value_ref: "source_fallback",
    proposed_value:
      "Render headline, deck, CTA, response text, footer text, and archive URL from canonical content before any publish path exists.",
    status: "previewed",
    risk_level: "medium",
    authority_state: "source_truth_resolved_preview_only",
    required_approval_ids: [],
    allowed_actions: ["render_preview", "request_review"],
    forbidden_actions: ["save", "publish", "send", "sync_provider"],
    preview_targets: ["/content/preview", "/newsletter"],
    proof_ids: [
      "content.newsletter.page-content.source",
      "content.newsletter.component.defaults",
    ],
    evidence_uri: "repo://apps/www/src/pages/newsletter.astro",
    redaction: "public_copy_only",
    created_by: "agent",
    created_at: "2026-06-28T00:00:00Z",
    updated_at: "2026-06-28T00:00:00Z",
    expires_at: "2026-07-28T00:00:00Z",
    rollback_ref: "source_fallback",
  },
  {
    operation_id: "content-draft-project-card-fields-2026-06-28",
    kind: "content_draft",
    surface: "public_site",
    route: "/work",
    source_ref: "content/public/projects/*.md frontmatter",
    field_path: "projects.card_fields",
    current_value_ref: "source_markdown_frontmatter",
    proposed_value:
      "Expose project title, subtitle, description, year, category, role, status, links, tags, technical notes, and roadmap in admin before modeling any write route.",
    status: "previewed",
    risk_level: "low",
    authority_state: "source_inventory_preview_only",
    required_approval_ids: [],
    allowed_actions: ["render_preview", "request_review"],
    forbidden_actions: [
      "save",
      "publish",
      "deploy",
      "rewrite_markdown",
      "sync_external",
    ],
    preview_targets: [
      "/content",
      "/content/review",
      "/content/preview",
      "/work",
    ],
    proof_ids: [
      "content.projects.frontmatter.schema",
      "admin.content.source-inventory",
    ],
    evidence_uri: "repo://content/public/projects",
    redaction: "public_copy_only",
    created_by: "agent",
    created_at: "2026-06-28T00:00:00Z",
    updated_at: "2026-06-28T00:00:00Z",
    expires_at: "2026-07-28T00:00:00Z",
    rollback_ref: "source_markdown_frontmatter",
    reviewer_note:
      "Seeded as an inert review operation. No source files or public routes are changed.",
  },
  {
    operation_id: "content-draft-project-quantercise-detail-2026-06-29",
    kind: "content_draft",
    surface: "public_site",
    route: "/work/quantercise",
    source_ref: "content/public/projects/quantercise.md",
    field_path: "projects.quantercise.detail",
    current_value_ref: "published_canonical_source:project:quantercise",
    proposed_value:
      "Review future edits to the Quantercise title, summary, body, links, tags, and visibility before proposing a source-controlled canonical update.",
    status: "previewed",
    risk_level: "medium",
    authority_state: "canonical_source_preview_only_no_write",
    required_approval_ids: [],
    allowed_actions: ["render_preview", "request_review"],
    forbidden_actions: [
      "save",
      "publish",
      "deploy",
      "rewrite_markdown",
      "sync_external",
    ],
    preview_targets: [
      "/content/review",
      "/content/preview",
      "/work/quantercise",
    ],
    proof_ids: [
      "content.projects.quantercise.page-content",
      "admin.content.preview.d1",
    ],
    evidence_uri: "repo://content/public/projects/quantercise.md",
    redaction: "public_copy_only",
    created_by: "agent",
    created_at: "2026-06-29T07:30:00Z",
    updated_at: "2026-06-29T07:30:00Z",
    expires_at: "2026-07-29T07:30:00Z",
    rollback_ref: "source_markdown:content/public/projects/quantercise.md",
    reviewer_note:
      "Project detail is projected as preview metadata. No source rewrite or publish event is created.",
  },
  {
    operation_id: "content-draft-writing-newsletter-backfill-2026-06-28",
    kind: "content_draft",
    surface: "newsletter",
    route: "/writing",
    source_ref: "content/public/writing/*.md frontmatter and body",
    field_path: "writing.newsletter_backfill",
    current_value_ref: "source_markdown_collection",
    proposed_value:
      "Review published writing titles, summaries, tags, dates, and body length as newsletter backfill candidates without sending or scheduling an issue.",
    status: "previewed",
    risk_level: "medium",
    authority_state: "backfill_review_only_no_send",
    required_approval_ids: [],
    allowed_actions: ["render_preview", "request_review"],
    forbidden_actions: ["save", "publish", "send", "schedule", "sync_provider"],
    preview_targets: [
      "/content",
      "/content/review",
      "/content/preview",
      "/writing",
      "/newsletter",
    ],
    proof_ids: [
      "content.writing.frontmatter.schema",
      "content.newsletter.backfill.plan",
      "admin.content.source-inventory",
    ],
    evidence_uri: "repo://content/public/writing",
    redaction: "public_copy_only",
    created_by: "agent",
    created_at: "2026-06-28T00:00:00Z",
    updated_at: "2026-06-28T00:00:00Z",
    expires_at: "2026-07-28T00:00:00Z",
    rollback_ref: "source_markdown_collection",
    reviewer_note:
      "Seeded as an inert review operation. No newsletter provider action, send, schedule, or source mutation is created.",
  },
  {
    operation_id: "content-draft-writing-saturdays-detail-2026-06-29",
    kind: "content_draft",
    surface: "public_site",
    route: "/writing/saturdays-are-for-claude-code",
    source_ref: "content/public/writing/saturdays-are-for-claude-code.md",
    field_path: "writing.saturdays_are_for_claude_code.detail",
    current_value_ref:
      "published_canonical_source:writing:saturdays-are-for-claude-code",
    proposed_value:
      "Review future edits to the Saturdays are for Claude Code title, summary, body, source link, tags, and visibility before proposing a source-controlled canonical update.",
    status: "previewed",
    risk_level: "medium",
    authority_state: "canonical_source_preview_only_no_write",
    required_approval_ids: [],
    allowed_actions: ["render_preview", "request_review"],
    forbidden_actions: [
      "save",
      "publish",
      "send",
      "schedule",
      "rewrite_markdown",
      "sync_provider",
    ],
    preview_targets: [
      "/content/review",
      "/content/preview",
      "/writing/saturdays-are-for-claude-code",
    ],
    proof_ids: [
      "content.writing.saturdays.page-content",
      "admin.content.preview.d1",
    ],
    evidence_uri:
      "repo://content/public/writing/saturdays-are-for-claude-code.md",
    redaction: "public_copy_only",
    created_by: "agent",
    created_at: "2026-06-29T07:30:00Z",
    updated_at: "2026-06-29T07:30:00Z",
    expires_at: "2026-07-29T07:30:00Z",
    rollback_ref:
      "source_markdown:content/public/writing/saturdays-are-for-claude-code.md",
    reviewer_note:
      "Writing detail is projected as preview metadata. No source rewrite, send, or publish event is created.",
  },
  ...remainingDetailContentOperationTemplates,
  {
    operation_id: "content-draft-making-index-copy-2026-06-29",
    kind: "content_draft",
    surface: "public_site",
    route: "/work",
    source_ref: "content/public/pages/work.md",
    field_path: "projects.making_index_copy_and_buckets",
    current_value_ref: "published_canonical_source:making",
    proposed_value:
      "Review future edits to the /work title, meta description, hero copy, and project bucket labels before proposing a source-controlled canonical update.",
    status: "previewed",
    risk_level: "low",
    authority_state: "page_content_preview_only_no_write",
    required_approval_ids: [],
    allowed_actions: ["render_preview", "request_review"],
    forbidden_actions: [
      "save",
      "publish",
      "deploy",
      "rewrite_source",
      "sync_external",
    ],
    preview_targets: ["/content/review", "/content/preview", "/work"],
    proof_ids: [
      "content.projects.index.page-content",
      "admin.content.preview.d1",
    ],
    evidence_uri: "repo://apps/www/src/pages/work/index.astro",
    redaction: "public_copy_only",
    created_by: "agent",
    created_at: "2026-06-29T00:00:00Z",
    updated_at: "2026-06-29T00:00:00Z",
    expires_at: "2026-07-29T00:00:00Z",
    rollback_ref: "source_markdown:content/public/pages/work.md",
  },
  {
    operation_id: "content-draft-projects-index-copy-2026-06-29",
    kind: "content_draft",
    surface: "public_site",
    route: "/projects",
    source_ref: "content/public/pages/projects.md",
    field_path: "projects.archive_index_copy",
    current_value_ref: "published_canonical_source:projects",
    proposed_value:
      "Review future edits to the /projects title, meta description, hero copy, and work link before proposing a source-controlled canonical update.",
    status: "previewed",
    risk_level: "low",
    authority_state: "page_content_preview_only_no_write",
    required_approval_ids: [],
    allowed_actions: ["render_preview", "request_review"],
    forbidden_actions: [
      "save",
      "publish",
      "deploy",
      "rewrite_source",
      "sync_external",
    ],
    preview_targets: ["/content/review", "/content/preview", "/projects"],
    proof_ids: [
      "content.projects.archive-index.page-content",
      "admin.content.preview.d1",
    ],
    evidence_uri: "repo://apps/www/src/pages/work/index.astro",
    redaction: "public_copy_only",
    created_by: "agent",
    created_at: "2026-06-29T00:00:00Z",
    updated_at: "2026-06-29T00:00:00Z",
    expires_at: "2026-07-29T00:00:00Z",
    rollback_ref: "source_markdown:content/public/pages/projects.md",
  },
  {
    operation_id: "content-draft-writing-index-copy-2026-06-29",
    kind: "content_draft",
    surface: "public_site",
    route: "/writing",
    source_ref: "content/public/pages/writing.md",
    field_path: "writing.index_copy",
    current_value_ref: "published_canonical_source:writing",
    proposed_value:
      "Review future edits to the /writing title, meta description, hero summary, and search placeholder before proposing a source-controlled canonical update.",
    status: "previewed",
    risk_level: "low",
    authority_state: "page_content_preview_only_no_write",
    required_approval_ids: [],
    allowed_actions: ["render_preview", "request_review"],
    forbidden_actions: [
      "save",
      "publish",
      "deploy",
      "rewrite_source",
      "sync_external",
    ],
    preview_targets: ["/content/review", "/content/preview", "/writing"],
    proof_ids: [
      "content.writing.index.page-content",
      "admin.content.preview.d1",
    ],
    evidence_uri: "repo://apps/www/src/pages/writing/index.astro",
    redaction: "public_copy_only",
    created_by: "agent",
    created_at: "2026-06-29T00:00:00Z",
    updated_at: "2026-06-29T00:00:00Z",
    expires_at: "2026-07-29T00:00:00Z",
    rollback_ref: "source_markdown:content/public/pages/writing.md",
  },
  {
    operation_id: "content-draft-newsletter-archive-copy-2026-06-29",
    kind: "content_draft",
    surface: "newsletter",
    route: "/newsletter/archive",
    source_ref: "content/public/pages/newsletter_archive.md",
    field_path: "newsletter.archive_copy",
    current_value_ref: "published_canonical_source:newsletter_archive",
    proposed_value:
      "Review future edits to the /newsletter/archive title, meta description, section label, hero title, and hero summary before proposing a source-controlled canonical update.",
    status: "previewed",
    risk_level: "low",
    authority_state: "page_content_preview_only_no_write",
    required_approval_ids: [],
    allowed_actions: ["render_preview", "request_review"],
    forbidden_actions: ["save", "publish", "send", "schedule", "sync_provider"],
    preview_targets: [
      "/content/review",
      "/content/preview",
      "/newsletter/archive",
    ],
    proof_ids: [
      "content.newsletter.archive.page-content",
      "admin.content.preview.d1",
    ],
    evidence_uri: "repo://apps/www/src/pages/newsletter/archive.astro",
    redaction: "public_copy_only",
    created_by: "agent",
    created_at: "2026-06-29T00:00:00Z",
    updated_at: "2026-06-29T00:00:00Z",
    expires_at: "2026-07-29T00:00:00Z",
    rollback_ref: "source_markdown:content/public/pages/newsletter_archive.md",
  },
  {
    operation_id: "content-draft-orchestrating-hero-copy-2026-06-29",
    kind: "content_draft",
    surface: "public_site",
    route: "/orchestrating",
    source_ref: "content/public/pages/orchestrating.md",
    field_path: "orchestrating.hero_sections_loop_tools",
    current_value_ref: "published_canonical_source:orchestrating",
    proposed_value:
      "Review future edits to the /orchestrating hero, section labels, loop cards, and public-tool cards before proposing a source-controlled canonical update.",
    status: "previewed",
    risk_level: "medium",
    authority_state: "page_content_preview_only_no_write",
    required_approval_ids: [],
    allowed_actions: ["render_preview", "request_review"],
    forbidden_actions: [
      "save",
      "publish",
      "deploy",
      "rewrite_source",
      "sync_external",
    ],
    preview_targets: ["/content/review", "/content/preview", "/orchestrating"],
    proof_ids: [
      "content.orchestrating.hero.page-content",
      "admin.content.preview.d1",
    ],
    evidence_uri: "repo://apps/www/src/pages/orchestrating.astro",
    redaction: "public_copy_only",
    created_by: "agent",
    created_at: "2026-06-29T00:00:00Z",
    updated_at: "2026-06-29T00:00:00Z",
    expires_at: "2026-07-29T00:00:00Z",
    rollback_ref: "source_markdown:content/public/pages/orchestrating.md",
    reviewer_note:
      "Expanded from hero-only copy to a fuller page_content contract. Still inert preview metadata only.",
  },
];
