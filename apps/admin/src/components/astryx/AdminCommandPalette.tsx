import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CommandPalette,
  CommandPaletteInput,
} from "@astryxdesign/core/CommandPalette";
import type {
  SearchableItem,
  SearchSource,
} from "@astryxdesign/core/Typeahead";
import { MagnifyingGlassIcon } from "../admin-icons";
import type { NavItem } from "../../data/admin";
import {
  searchAdminResults,
  type AdminSearchResult,
} from "../../data/admin-search";

type SearchItem = SearchableItem<AdminSearchResult & { group: string }>;

type Props = {
  navItems: NavItem[];
  showTrigger?: boolean;
};

const titleCase = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

function navResults(navItems: NavItem[]): AdminSearchResult[] {
  return navItems.map((item) => ({
    id: `nav:${item.href}`,
    label: item.label,
    domain: "navigation",
    kind: item.parent ? item.parent : "destination",
    currentFact: item.description,
    source: "admin",
    freshness: "current",
    href: item.href,
    keywords: [item.group, item.status, item.parent ?? ""],
  }));
}

async function loadLiveResults(): Promise<AdminSearchResult[]> {
  const rows: AdminSearchResult[] = [];
  const [inboxResponse, knowledgeResponse, runtimeResponse] =
    await Promise.allSettled([
      fetch("/api/admin/inbox", { headers: { accept: "application/json" } }),
      fetch("/api/admin/knowledge?limit=50", {
        headers: { accept: "application/json" },
      }),
      fetch("/api/admin/runtime-feed", {
        headers: { accept: "application/json" },
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
        href: `/?item=${encodeURIComponent(item.id)}`,
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

  return rows;
}

function toSearchItems(results: AdminSearchResult[]): SearchItem[] {
  return results.map((row) => ({
    id: row.id,
    label: row.label,
    auxiliaryData: {
      ...row,
      group: titleCase(row.domain),
    },
  }));
}

export function AdminCommandPalette({ navItems, showTrigger = true }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const hrefs = useRef(new Map<string, string>());
  const staticRows = useMemo(() => navResults(navItems), [navItems]);
  const liveRows = useRef<AdminSearchResult[]>([]);

  const source = useMemo<SearchSource<SearchItem>>(
    () => ({
      async bootstrap() {
        if (liveRows.current.length === 0) {
          liveRows.current = await loadLiveResults();
        }
        const rows = [...staticRows, ...liveRows.current];
        hrefs.current = new Map(rows.map((row) => [row.id, row.href]));
        return toSearchItems(rows.slice(0, 18));
      },
      async search(query) {
        if (liveRows.current.length === 0) {
          liveRows.current = await loadLiveResults();
        }
        const rows = searchAdminResults(
          [...staticRows, ...liveRows.current],
          query,
        );
        hrefs.current = new Map(rows.map((row) => [row.id, row.href]));
        return toSearchItems(rows);
      },
    }),
    [staticRows],
  );

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen(true);
      }
    };
    const handleOpen = () => setIsOpen(true);
    document.addEventListener("keydown", handleKey);
    document.addEventListener("admin:search", handleOpen);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("admin:search", handleOpen);
    };
  }, []);

  return (
    <>
      {showTrigger ? (
        <button
          type="button"
          className="admin-global-search"
          aria-label="search everything"
          aria-keyshortcuts="Meta+K Control+K"
          onClick={() => setIsOpen(true)}
        >
          <MagnifyingGlassIcon size={16} aria-hidden="true" />
          <span>Search anything</span>
          <kbd>⌘K</kbd>
        </button>
      ) : null}
      <CommandPalette
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        searchSource={source}
        input={<CommandPaletteInput placeholder="Search anything" />}
        label="Search admin"
        width={680}
        maxHeight={520}
        onValueChange={(id) => {
          const href = hrefs.current.get(id);
          if (href) window.location.assign(href);
        }}
        renderItem={(item) => (
          <span className="admin-search-result">
            <span>
              <strong>{item.label}</strong>
              <small>{item.auxiliaryData?.currentFact}</small>
            </span>
            <span className="admin-search-result-meta">
              {item.auxiliaryData?.kind}
            </span>
          </span>
        )}
        emptySearchText="No matching result"
        emptyBootstrapText="No current results"
      />
    </>
  );
}
