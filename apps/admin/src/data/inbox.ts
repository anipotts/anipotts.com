import {
  newsletterDrafts,
  readContentOperationStore,
  readPageContentInventoryStore,
  readProofEntries,
  type ContentInventoryD1Database,
  type ContentOperationD1Database,
  type ProofD1Database,
  type RiskLevel,
} from "@anipotts/content/admin";
import {
  loadAdminControlSnapshot,
  type AdminControlDatabase,
  type AdminInboxItem as AdminControlInboxItem,
} from "@anipotts/lib/admin-control";
import { carouselPosts, carouselSummary } from "./carousels";
import { loadRuntimeOverlayResponse } from "./runtime";

type BoundAdminControlDatabase = Exclude<
  AdminControlDatabase,
  null | undefined
>;

type AdminInboxDb = ContentInventoryD1Database &
  ContentOperationD1Database &
  ProofD1Database &
  BoundAdminControlDatabase;

export type AdminInboxCategory = "health" | "content" | "income" | "system";
export type AdminInboxTimeframe =
  | "now"
  | "today"
  | "this week"
  | "waiting / gated";

export type AdminInboxItem = {
  id: string;
  dedupe_key: string;
  domain: string;
  entity_ref: string | null;
  attention_kind: string;
  source: string;
  owner: string;
  action_kind: string;
  title: string;
  summary: string;
  status: string;
  risk: RiskLevel;
  category: AdminInboxCategory;
  timeframe: AdminInboxTimeframe;
  href: string;
  next_action: string;
  copy_text?: string;
  proof: string;
  updated_at: string;
};

export type AdminInboxReadState = {
  generated_at: string;
  mode: "ready" | "partial";
  counts: {
    total: number;
    high: number;
    medium: number;
    low: number;
  };
  items: AdminInboxItem[];
};

const CLOSED_STATUSES = new Set([
  "archived",
  "closed",
  "completed",
  "resolved",
  "verified",
]);

export async function readAdminInbox(
  db: AdminInboxDb | null | undefined,
): Promise<AdminInboxReadState> {
  const now = new Date().toISOString();
  const [control, proof, operations, pageContent, runtime] = await Promise.all([
    loadAdminControlSnapshot(db),
    readProofEntries(db),
    readContentOperationStore(db),
    readPageContentInventoryStore(db),
    loadRuntimeOverlayResponse(),
  ]);

  const items: AdminInboxItem[] = [
    ...control.projections.inbox_items
      .filter((item) => isOpenProjectionItem(item))
      .map((item) => inboxItemFromProjection(item, now)),
    ...proof
      .filter((entry) => entry.status !== "verified")
      .map<AdminInboxItem>((entry) => ({
        id: entry.id,
        dedupe_key: `proof:${entry.id}`,
        domain: "proof",
        entity_ref: `proof:${entry.id}`,
        attention_kind: "proof",
        source: entry.kind === "auth" ? "auth" : "deploy",
        owner: "site/admin",
        action_kind: "verify",
        title: entry.title,
        summary: entry.summary,
        status: normalizeStatus(entry.status),
        risk: entry.status === "blocked" ? "high" : "medium",
        category: "system",
        timeframe: entry.status === "blocked" ? "waiting / gated" : "now",
        href: entry.kind === "auth" ? "/proof" : "/deploys",
        next_action: entry.next_safe_action,
        copy_text: entry.next_safe_action,
        proof: entry.evidence_uri,
        updated_at: now,
      })),
    ...operations.operations
      .filter((operation) =>
        ["draft", "previewed", "needs_ani", "blocked"].includes(
          operation.status,
        ),
      )
      .slice(0, 8)
      .map<AdminInboxItem>((operation) => {
        const nextAction =
          operation.status === "blocked"
            ? operation.authority_state
            : "open preview, then publish only a selected published-visibility draft";

        return {
          id: operation.operation_id,
          dedupe_key: `content-operation:${operation.operation_id}`,
          domain: "content",
          entity_ref: `content-operation:${operation.operation_id}`,
          attention_kind: operation.status === "blocked" ? "blocked" : "review",
          source: "content",
          owner: operation.created_by,
          action_kind: operation.status === "blocked" ? "approve" : "review",
          title: operation.field_path,
          summary: operation.reviewer_note ?? operation.proposed_value,
          status: normalizeStatus(operation.status),
          risk: operation.risk_level,
          category: "content",
          timeframe:
            operation.status === "blocked" ? "waiting / gated" : "today",
          href: operation.preview_targets[0] ?? "/content/drafts",
          next_action: nextAction,
          copy_text: nextAction,
          proof: operation.proof_ids.join(", ") || operation.source_ref,
          updated_at: operation.updated_at,
        };
      }),
    ...runtime.overlays
      .filter(
        (overlay) =>
          (overlay.ahead ?? 0) > 0 ||
          (overlay.behind ?? 0) > 0 ||
          (overlay.dirty_tracked_count ?? 0) > 0 ||
          (overlay.untracked_count ?? 0) > 0 ||
          !overlay.git_available,
      )
      .map<AdminInboxItem>((overlay) => ({
        id: overlay.repo_state_id,
        dedupe_key: `fleet:${overlay.repo_state_id}`,
        domain: "fleet",
        entity_ref: `repo-state:${overlay.repo_state_id}`,
        attention_kind:
          overlay.deploy_impact === "production" ? "action" : "review",
        source: "fleet",
        owner: "chief/infra",
        action_kind: "review",
        title: `${overlay.repo} on ${overlay.machine}`,
        summary: `${overlay.branch ?? "no branch"} / dirty ${overlay.dirty_tracked_count ?? 0} / untracked ${overlay.untracked_count ?? 0}`,
        status: overlay.git_available
          ? normalizeStatus(overlay.deploy_impact)
          : "git unavailable",
        risk: overlay.deploy_impact === "production" ? "high" : "medium",
        category: "system",
        timeframe: overlay.deploy_impact === "production" ? "now" : "today",
        href: "/fleet",
        next_action: overlay.notes,
        copy_text: overlay.notes,
        proof: overlay.live_runtime_role,
        updated_at: runtime.generated_at ?? now,
      })),
    ...runtime.gmail_sent_awareness.projections.inbox_items
      .filter((item) => isOpenProjectionItem(item))
      .map<AdminInboxItem>((item) => {
        const nextAction =
          item.action_kind === "none"
            ? "no action required"
            : "review the projected follow-up; sent-mail proof is event-only";

        return {
          id: item.item_id,
          dedupe_key: item.dedupe_key,
          domain: item.domain ?? "mail",
          entity_ref: item.entity_ref ?? null,
          attention_kind: item.attention_kind ?? item.action_kind,
          source: "gmail",
          owner: item.owner,
          action_kind: item.action_kind,
          title: item.title,
          summary: item.summary,
          status: normalizeStatus(item.status),
          risk: riskForUrgency(item.urgency),
          category: "income",
          timeframe: timeframeForProjection(item),
          href: item.href ?? "/inbox?category=income",
          next_action: nextAction,
          copy_text: item.action_kind === "none" ? undefined : nextAction,
          proof: item.event_refs.join(", ") || item.dedupe_key,
          updated_at:
            item.last_seen_at ?? runtime.generated_at ?? item.expires_at ?? now,
        };
      }),
    ...newsletterDrafts
      .filter((draft) => draft.status !== "ready_for_review")
      .slice(0, 4)
      .map<AdminInboxItem>((draft) => ({
        id: draft.id,
        dedupe_key: `newsletter:${draft.id}`,
        domain: "content",
        entity_ref: `newsletter:${draft.id}`,
        attention_kind: draft.status === "blocked" ? "blocked" : "review",
        source: "newsletter",
        owner: "chief/site",
        action_kind: "review",
        title: draft.title,
        summary: draft.summary,
        status: normalizeStatus(draft.status),
        risk: draft.status === "blocked" ? "high" : "low",
        category: "content",
        timeframe: draft.status === "blocked" ? "waiting / gated" : "this week",
        href: `/newsletter/${draft.slug}`,
        next_action: draft.pipeline.next_action,
        copy_text: draft.pipeline.next_action,
        proof: draft.source_fixture,
        updated_at: now,
      })),
    ...carouselPosts
      .filter((post) => post.staleCount > 0 || post.soundStatus !== "approved")
      .slice(0, 4)
      .map<AdminInboxItem>((post) => {
        const nextAction =
          carouselSummary.staleExports > 0
            ? "review stale crop outputs before export"
            : "review sound approval before platform prep";

        return {
          id: post.id,
          dedupe_key: `carousel:${post.id}`,
          domain: "content",
          entity_ref: `carousel:${post.id}`,
          attention_kind: "review",
          source: "carousel",
          owner: "media/carousels",
          action_kind: "review",
          title: post.title,
          summary: `${post.readyExports}/${post.slideCount * 2} exports ready; sound ${post.soundStatus}`,
          status: normalizeStatus(post.status),
          risk: post.staleCount > 0 ? "medium" : "low",
          category: "content",
          timeframe: "this week",
          href: "/content/carousels",
          next_action: nextAction,
          copy_text: nextAction,
          proof: "media carousel handoff manifest",
          updated_at: now,
        };
      }),
  ];

  if (control.errors.length > 0) {
    items.push({
      id: "admin-control.read-unavailable",
      dedupe_key: "admin-control:read-unavailable",
      domain: "fleet",
      entity_ref: "admin-control:read",
      attention_kind: "proof",
      source: "system",
      owner: "site/admin",
      action_kind: "verify",
      title: "admin projection read is partial",
      summary: `${control.errors.length} projection sources could not return live D1 state.`,
      status: "read unavailable",
      risk: "medium",
      category: "system",
      timeframe: "today",
      href: "/api/admin/projections",
      next_action:
        "inspect projection errors without substituting fixture work",
      copy_text: "inspect projection errors without substituting fixture work",
      proof: `${control.errors.length} projection read errors`,
      updated_at: now,
    });
  }

  if (pageContent.mode !== "ready") {
    items.push({
      id: "content.page-content.unavailable",
      dedupe_key: "content:page-content:unavailable",
      domain: "content",
      entity_ref: "page-content:d1",
      attention_kind: "proof",
      source: "content",
      owner: "chief/site",
      action_kind: "verify",
      title: "page_content read unavailable",
      summary:
        pageContent.mode === "read_failed"
          ? pageContent.error
          : "D1 binding is missing in this runtime.",
      status: normalizeStatus(pageContent.mode),
      risk: "medium",
      category: "content",
      timeframe: "today",
      href: "/content",
      next_action:
        "fix DB binding or local runtime before editing public content",
      copy_text:
        "fix DB binding or local runtime before editing public content",
      proof: "D1 page_content",
      updated_at: now,
    });
  }

  const sorted = dedupeInboxItems(items).sort(
    (a, b) => score(b) - score(a) || b.updated_at.localeCompare(a.updated_at),
  );

  return {
    generated_at: now,
    mode:
      control.errors.length === 0 &&
      pageContent.mode === "ready" &&
      operations.mode !== "read_failed" &&
      runtime.mode !== "error"
        ? "ready"
        : "partial",
    counts: {
      total: sorted.length,
      high: sorted.filter((item) => item.risk === "high").length,
      medium: sorted.filter((item) => item.risk === "medium").length,
      low: sorted.filter((item) => item.risk === "low").length,
    },
    items: sorted,
  };
}

function isOpenProjectionItem(
  item: Pick<AdminControlInboxItem, "action_kind" | "status">,
): boolean {
  return item.action_kind !== "none" && !CLOSED_STATUSES.has(item.status);
}

function inboxItemFromProjection(
  item: AdminControlInboxItem,
  now: string,
): AdminInboxItem {
  const category = categoryForProjection(item);

  return {
    id: item.item_id,
    dedupe_key: item.dedupe_key,
    domain: item.domain,
    entity_ref: item.entity_ref,
    attention_kind: item.attention_kind,
    source: item.source,
    owner: item.owner,
    action_kind: item.action_kind,
    title: item.title,
    summary: item.summary,
    status: normalizeStatus(item.status),
    risk: riskForUrgency(item.urgency),
    category,
    timeframe: timeframeForProjection(item),
    href: item.href ?? `/inbox?category=${category}`,
    next_action: nextActionForProjection(item),
    proof: item.event_refs.join(", ") || item.dedupe_key,
    updated_at: item.last_seen_at ?? item.expires_at ?? now,
  };
}

function categoryForProjection(
  item: AdminControlInboxItem,
): AdminInboxCategory {
  const ref = [item.source, item.owner, item.account, item.title]
    .filter(Boolean)
    .join(":")
    .toLowerCase();

  if (ref.includes("health") || ref.includes("vitals")) return "health";
  if (
    ref.includes("business") ||
    ref.includes("jobs") ||
    ref.includes("income") ||
    ref.includes("payment") ||
    ref.includes("gmail")
  ) {
    return "income";
  }
  if (
    ref.includes("brand") ||
    ref.includes("site") ||
    ref.includes("content") ||
    ref.includes("newsletter") ||
    ref.includes("media") ||
    ref.includes("carousel")
  ) {
    return "content";
  }
  return "system";
}

function timeframeForProjection(
  item: Pick<AdminControlInboxItem, "status" | "urgency">,
): AdminInboxTimeframe {
  const status = item.status.toLowerCase();
  if (
    status.includes("blocked") ||
    status.includes("gated") ||
    status.includes("waiting")
  ) {
    return "waiting / gated";
  }
  if (item.urgency === "urgent" || item.urgency === "high") return "now";
  if (item.urgency === "low") return "this week";
  return "today";
}

function riskForUrgency(urgency: string): RiskLevel {
  if (urgency === "urgent" || urgency === "high") return "high";
  if (urgency === "low") return "low";
  return "medium";
}

function nextActionForProjection(item: AdminControlInboxItem): string {
  switch (item.action_kind) {
    case "approve":
      return `review the source and approve ${item.title}`;
    case "decide":
      return `choose the next action for ${item.title}`;
    case "verify":
      return `verify ${item.title}`;
    case "deadline":
      return `review the deadline for ${item.title}`;
    case "review":
      return `review ${item.title}`;
    default:
      return `open ${item.title}`;
  }
}

function normalizeStatus(status: string): string {
  return status
    .replaceAll("needs_ani", "review_required")
    .replaceAll("needs ani", "action required")
    .replaceAll("_", " ");
}

function dedupeInboxItems(items: AdminInboxItem[]): AdminInboxItem[] {
  const unique = new Map<string, AdminInboxItem>();
  for (const item of items) unique.set(item.dedupe_key, item);
  return [...unique.values()];
}

function score(item: AdminInboxItem): number {
  const risk = item.risk === "high" ? 30 : item.risk === "medium" ? 20 : 10;
  const action = ["approve", "decide", "verify"].includes(item.action_kind)
    ? 5
    : 0;
  const timeframe =
    item.timeframe === "now" ? 4 : item.timeframe === "today" ? 2 : 0;
  return risk + action + timeframe;
}
