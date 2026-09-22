/** Read-only legacy content diagnostics over the retained D1 content tables. */

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = unknown>(): Promise<{ results?: T[] }>;
};

export type ContentEditorD1Database = {
  prepare(query: string): D1PreparedStatement;
};

export type ContentVisibility = "private" | "draft" | "hidden" | "published";
export type ContentEditorKind = "writing" | "page";

export type ContentEditorPayload = {
  kind: ContentEditorKind;
  page_key: string;
  title: string;
  slug: string;
  summary: string;
  tags: string[];
  body: string;
  visibility: ContentVisibility;
  date: string;
  updated_by: string;
  updated_at: string;
  content: Record<string, unknown>;
};

export type ContentRevision = {
  id: string;
  source: "draft" | "published" | "publish_event";
  timestamp: string;
  author: string;
  status: string;
  summary: string;
  rollback_target: string;
  view_href: string;
};

export type ContentEditorState = {
  page_key: string;
  current: ContentEditorPayload;
  current_version: number;
  latest_draft: ContentRevision | null;
  revisions: ContentRevision[];
};

type PageContentRow = {
  id: string;
  page_key: string;
  content: string;
  version: number | null;
  published: number | boolean | null;
  updated_at: string | null;
  updated_by: string | null;
  created_at: string | null;
  version_history: string | null;
};

type DraftOperationRow = {
  operation_id: string;
  field_path: string;
  proposed_value: string;
  status: string;
  created_by: string;
  updated_at: string;
  rollback_ref: string;
  reviewer_note: string | null;
  title?: string | null;
  visibility?: string | null;
  updated_by?: string | null;
};

type PublishEventRow = {
  id: string;
  operation_id: string | null;
  event_type: string;
  status: string;
  summary: string;
  rollback_ref: string;
  created_by: string;
  created_at: string;
};

const DEFAULT_AUTHOR = "ani";
const MAX_BODY_LENGTH = 50_000;
const MAX_SUMMARY_LENGTH = 600;
const MAX_TITLE_LENGTH = 160;

export async function readContentEditorState(
  db: ContentEditorD1Database | null | undefined,
  pageKey: string,
): Promise<ContentEditorState> {
  const cleanPageKey = normalizePageKey(pageKey || "writing:new");
  if (!db) {
    const current = payloadFromContent(null, cleanPageKey);
    return {
      page_key: cleanPageKey,
      current,
      current_version: 0,
      latest_draft: null,
      revisions: [],
    };
  }

  const [published, drafts, events] = await Promise.all([
    readOptionalRows(() => readPageRows(db, cleanPageKey)),
    readOptionalRows(() => readDraftRows(db, cleanPageKey)),
    readOptionalRows(() => readPublishEvents(db, cleanPageKey)),
  ]);
  const currentRow =
    published.find((row) => isPublished(row.published)) ?? published[0] ?? null;
  const current = payloadFromContent(currentRow, cleanPageKey);
  const draftRevisions = drafts.map(draftRevisionFromRow);
  const publishedRevisions = published.map(publishedRevisionFromRow);
  const publishEventRevisions = events.map(publishEventRevisionFromRow);
  const revisions = [
    ...draftRevisions,
    ...publishedRevisions,
    ...publishEventRevisions,
  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return {
    page_key: cleanPageKey,
    current,
    current_version: Number(currentRow?.version ?? 0),
    latest_draft: draftRevisions[0] ?? null,
    revisions,
  };
}

async function readOptionalRows<T>(reader: () => Promise<T[]>): Promise<T[]> {
  try {
    return await reader();
  } catch (error) {
    if (isMissingContentStorage(error)) return [];
    throw error;
  }
}

function payloadFromContent(
  row: PageContentRow | null,
  pageKey: string,
): ContentEditorPayload {
  const raw = parseJsonObject(row?.content ?? null);
  const slug = normalizeSlug(
    typeof raw.slug === "string"
      ? raw.slug
      : pageKey.split(":").pop() || pageKey,
  );
  const title =
    cleanOptional(raw.title, MAX_TITLE_LENGTH) ||
    cleanOptional(raw.hero_title, MAX_TITLE_LENGTH) ||
    cleanOptional(raw.headline, MAX_TITLE_LENGTH) ||
    slug.replaceAll("-", " ");
  const summary =
    cleanOptional(raw.preview, MAX_SUMMARY_LENGTH) ||
    cleanOptional(raw.summary, MAX_SUMMARY_LENGTH) ||
    cleanOptional(raw.hero_summary, MAX_SUMMARY_LENGTH) ||
    cleanOptional(raw.description, MAX_SUMMARY_LENGTH) ||
    "";
  const body =
    cleanOptional(raw.body, MAX_BODY_LENGTH) ||
    cleanOptional(raw.content, MAX_BODY_LENGTH) ||
    JSON.stringify(raw, null, 2);
  const tags = normalizeTags(Array.isArray(raw.tags) ? raw.tags : []);
  const visible =
    typeof raw.visible === "boolean"
      ? raw.visible
      : isPublished(row?.published ?? false);

  return {
    kind: pageKey.startsWith("writing:") ? "writing" : "page",
    page_key: pageKey,
    title,
    slug,
    summary,
    tags,
    body,
    visibility: visible ? "published" : "hidden",
    date:
      cleanOptional(raw.date, 20) ||
      cleanOptional(raw.published_at, 20) ||
      isoDate(new Date()),
    updated_by: row?.updated_by ?? DEFAULT_AUTHOR,
    updated_at: row?.updated_at ?? new Date().toISOString(),
    content: raw,
  };
}

async function readPageRows(
  db: ContentEditorD1Database,
  pageKey: string,
): Promise<PageContentRow[]> {
  const rows = await db
    .prepare(
      `SELECT
         id,
         page_key,
         content,
         version,
         published,
         updated_at,
         updated_by,
         created_at,
         version_history
       FROM page_content
       WHERE page_key = ?
       ORDER BY version DESC, updated_at DESC
       LIMIT 20`,
    )
    .bind(pageKey)
    .all<PageContentRow>();
  return rows.results ?? [];
}

async function readDraftRows(
  db: ContentEditorD1Database,
  pageKey: string,
): Promise<DraftOperationRow[]> {
  const rows = await db
    .prepare(
      `SELECT
         operation_id,
         surface,
         route,
         source_ref,
         field_path,
         proposed_value,
         status,
         risk_level,
         authority_state,
         created_by,
         created_at,
         updated_at,
         rollback_ref,
         reviewer_note,
         metadata,
         page_key,
         slug,
         title,
         visibility,
         updated_by,
         published_from_operation_id
       FROM content_draft_operations
       WHERE page_key = ?
          OR metadata LIKE ?
          OR current_value_ref LIKE ?
          OR rollback_ref LIKE ?
       ORDER BY updated_at DESC
       LIMIT 30`,
    )
    .bind(
      pageKey,
      `%"page_key":"${escapeLike(pageKey)}"%`,
      `%page_content:${escapeLike(pageKey)}%`,
      `%page_content:${escapeLike(pageKey)}%`,
    )
    .all<DraftOperationRow>();
  return rows.results ?? [];
}

async function readPublishEvents(
  db: ContentEditorD1Database,
  pageKey: string,
): Promise<PublishEventRow[]> {
  const rows = await db
    .prepare(
      `SELECT
         id,
         operation_id,
         event_type,
         status,
         summary,
         rollback_ref,
         created_by,
         created_at
       FROM content_publish_events
       WHERE metadata LIKE ?
       ORDER BY created_at DESC
       LIMIT 20`,
    )
    .bind(`%"page_key":"${escapeLike(pageKey)}"%`)
    .all<PublishEventRow>();
  return rows.results ?? [];
}

function draftRevisionFromRow(row: DraftOperationRow): ContentRevision {
  const payload = parseEditorPayload(row.proposed_value);
  return {
    id: row.operation_id,
    source: "draft",
    timestamp: row.updated_at,
    author: row.updated_by || row.created_by,
    status: payload?.visibility ?? row.visibility ?? row.status,
    summary:
      payload?.summary || row.title || row.reviewer_note || row.field_path,
    rollback_target: row.rollback_ref,
    view_href: `/content/preview?operation_id=${encodeURIComponent(row.operation_id)}`,
  };
}

function publishedRevisionFromRow(row: PageContentRow): ContentRevision {
  const payload = payloadFromContent(row, row.page_key);
  return {
    id: row.id,
    source: "published",
    timestamp: row.updated_at ?? row.created_at ?? "",
    author: row.updated_by ?? "unknown",
    status: isPublished(row.published) ? "published" : "hidden",
    summary: payload.summary || payload.title,
    rollback_target: `page_content:${row.page_key}@v${row.version ?? 0}`,
    view_href: `/content/edit/${encodeURIComponent(row.page_key)}?version=${row.version ?? 0}`,
  };
}

function publishEventRevisionFromRow(row: PublishEventRow): ContentRevision {
  return {
    id: row.id,
    source: "publish_event",
    timestamp: row.created_at,
    author: row.created_by,
    status: row.status,
    summary: row.summary,
    rollback_target: row.rollback_ref,
    view_href: `/content/operations#${encodeURIComponent(row.id)}`,
  };
}

function parseEditorPayload(value: string): ContentEditorPayload | null {
  const parsed = parseJsonObject(value);
  if (typeof parsed.page_key !== "string") return null;
  if (typeof parsed.title !== "string") return null;
  if (typeof parsed.slug !== "string") return null;
  if (typeof parsed.summary !== "string") return null;
  if (typeof parsed.body !== "string") return null;
  return {
    kind: parsed.kind === "page" ? "page" : "writing",
    page_key: normalizePageKey(parsed.page_key),
    title: parsed.title,
    slug: normalizeSlug(parsed.slug),
    summary: parsed.summary,
    tags: normalizeTags(parsed.tags),
    body: parsed.body,
    visibility: normalizeVisibility(parsed.visibility),
    date:
      typeof parsed.date === "string" && parsed.date.trim()
        ? parsed.date.trim()
        : isoDate(new Date()),
    updated_by:
      typeof parsed.updated_by === "string"
        ? parsed.updated_by
        : DEFAULT_AUTHOR,
    updated_at:
      typeof parsed.updated_at === "string"
        ? parsed.updated_at
        : new Date().toISOString(),
    content:
      parsed.content && typeof parsed.content === "object"
        ? (parsed.content as Record<string, unknown>)
        : {},
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function normalizeVisibility(value: unknown): ContentVisibility {
  if (
    value === "private" ||
    value === "draft" ||
    value === "hidden" ||
    value === "published"
  ) {
    return value;
  }
  return "draft";
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((tag): tag is string => typeof tag === "string")
      .flatMap((tag) => tag.split(","))
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 12);
  }
  if (typeof value === "string") return normalizeTags(value.split(","));
  return [];
}

function normalizeSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96);
  if (!slug) throw statusError(400, "slug_required");
  return slug;
}

function normalizePageKey(value: string): string {
  const clean = value.trim().toLowerCase();
  if (!/^[a-z0-9:_-]+$/.test(clean)) {
    throw statusError(400, "page_key_invalid");
  }
  return clean.slice(0, 160);
}

function cleanOptional(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function isPublished(value: number | boolean | null | undefined): boolean {
  return value === true || value === 1;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function escapeLike(value: string): string {
  return value.replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function isMissingContentStorage(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("no such table") &&
    (message.includes("page_content") ||
      message.includes("content_draft_operations") ||
      message.includes("content_publish_events"))
  );
}

function statusError(status: number, message: string): Response {
  return Response.json(
    { ok: false, error: message },
    {
      status,
      headers: { "cache-control": "no-store" },
    },
  );
}
