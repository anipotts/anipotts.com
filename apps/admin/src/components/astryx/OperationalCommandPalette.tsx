import { AdminCommandPalette } from "./AdminCommandPalette";
import type { NavItem } from "../../data/admin";
import type { AdminSearchResult } from "../../data/admin-search";
export async function loadLiveResults(): Promise<AdminSearchResult[]> {
  const rows: AdminSearchResult[] = [];
  const [inboxResponse, knowledgeResponse, runtimeResponse] =
    await Promise.allSettled([
      fetch("/api/admin/inbox", {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      }),
      fetch("/api/admin/knowledge?limit=50", {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      }),
      fetch("/api/admin/runtime-feed", {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      }),
    ]);

  if (inboxResponse.status === "fulfilled" && inboxResponse.value.ok) {
    const payload = await inboxResponse.value.json();
    for (const item of Array.isArray(payload?.items) ? payload.items : []) {
      rows.push({
        id: `inbox:${item.id}`,
        label: item.title,
        domain: "inbox",
        kind: item.category,
        currentFact: item.next_action || item.summary || item.status,
        source: item.source,
        freshness: item.updated_at || "current",
        href: `/inbox?item=${encodeURIComponent(item.id)}`,
        keywords: [item.owner, item.status, item.timeframe, item.category],
      });
    }
  }

  if (knowledgeResponse.status === "fulfilled" && knowledgeResponse.value.ok) {
    const payload = await knowledgeResponse.value.json();
    const cards = Array.isArray(payload?.cards)
      ? payload.cards
      : Array.isArray(payload?.bundle?.cards)
        ? payload.bundle.cards
        : [];
    for (const card of cards) {
      const domain =
        card.kind === "person" || card.kind === "people"
          ? "people"
          : card.domain === "content"
            ? "content"
            : card.domain === "life"
              ? "life"
              : card.domain === "work"
                ? "work"
                : "system";
      rows.push({
        id: `knowledge:${card.card_id}`,
        label: card.title,
        domain,
        kind: card.kind,
        currentFact: card.summary,
        source: card.source_system,
        freshness: card.effective_at || card.freshness_state,
        href: `/knowledge?card=${encodeURIComponent(card.card_id)}`,
        keywords: [card.domain, card.entity_ref, card.canonical_host],
      });
    }
  }

  if (runtimeResponse.status === "fulfilled" && runtimeResponse.value.ok) {
    const payload = await runtimeResponse.value.json();
    const tasks = Array.isArray(payload?.task_states)
      ? payload.task_states
      : Array.isArray(payload?.projections?.task_states)
        ? payload.projections.task_states
        : [];
    for (const task of tasks) {
      rows.push({
        id: `work:${task.task_id}`,
        label: task.canonical_title || task.title,
        domain: "work",
        kind: task.operator_state || "work",
        currentFact: task.next_action || task.bounded_goal || task.summary,
        source: task.provider || task.source,
        freshness: task.last_observed_at || task.freshness,
        href: `/work?view=now&entity=${encodeURIComponent(task.primary_entity_ref || task.task_id)}`,
        keywords: [task.project_label, task.owner, task.host],
      });
    }
  }

  if (
    [inboxResponse, knowledgeResponse, runtimeResponse].some(
      (result) => result.status === "rejected" || !result.value.ok,
    )
  ) {
    throw new Error(
      "Some operational sources could not be loaded. Navigation remains available.",
    );
  }
  return rows;
}

export function OperationalCommandPalette({
  navItems,
  showTrigger = true,
}: {
  navItems: NavItem[];
  showTrigger?: boolean;
}) {
  return (
    <AdminCommandPalette
      navItems={navItems}
      showTrigger={showTrigger}
      loadEntries={loadLiveResults}
    />
  );
}
