import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CommandPalette,
  CommandPaletteInput,
} from "@astryxdesign/core/CommandPalette";
import type {
  SearchableItem,
  SearchSource,
} from "@astryxdesign/core/Typeahead";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { Banner } from "@astryxdesign/core/Banner";
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
  entries?: AdminSearchResult[];
  loadEntries?: () => Promise<AdminSearchResult[]>;
  compact?: boolean;
  scope?: "editorial" | "operational";
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

export function AdminCommandPalette({
  navItems,
  entries,
  loadEntries,
  compact = false,
  scope = "operational",
  showTrigger = true,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const queryRef = useRef("");
  const hrefs = useRef(new Map<string, string>());
  const staticRows = useMemo(
    () => [...navResults(navItems), ...(entries ?? [])],
    [navItems, entries],
  );
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const loaded = useRef(false);
  const loading = useRef<Promise<void> | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const liveRows = useRef<AdminSearchResult[]>([]);

  const source = useMemo<SearchSource<SearchItem>>(() => {
    const load = async () => {
      if (!loadEntries || loaded.current) return;
      loading.current ??= loadEntries()
        .then((rows) => {
          liveRows.current = rows;
          loaded.current = true;
          setLoadError("");
        })
        .catch(() => {
          setLoadError(
            "Operational search is unavailable. Navigation is still available.",
          );
          loaded.current = true;
        })
        .finally(() => {
          loading.current = null;
        });
      await loading.current;
    };
    return {
      async bootstrap() {
        await load();
        const rows = [...staticRows, ...liveRows.current];
        hrefs.current = new Map(rows.map((row) => [row.id, row.href]));
        return toSearchItems(
          queryRef.current
            ? searchAdminResults(rows, queryRef.current)
            : rows.slice(0, 18),
        );
      },
      async search(query) {
        await load();
        const rows = searchAdminResults(
          [...staticRows, ...liveRows.current],
          query,
        );
        hrefs.current = new Map(rows.map((row) => [row.id, row.href]));
        return toSearchItems(rows);
      },
    };
  }, [staticRows, loadEntries, attempt]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (
        !event.defaultPrevented &&
        !event.isComposing &&
        !event.altKey &&
        !event.shiftKey &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        if (document.activeElement?.closest('[role="dialog"]')) return;
        previousFocus.current = document.activeElement as HTMLElement;
        setIsOpen(true);
      }
    };
    const handleOpen = () => {
      previousFocus.current = document.activeElement as HTMLElement;
      setIsOpen(true);
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("admin:search", handleOpen);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("admin:search", handleOpen);
    };
  }, []);

  useEffect(() => {
    if (wasOpen.current && !isOpen) previousFocus.current?.focus();
    wasOpen.current = isOpen;
  }, [isOpen]);

  return (
    <>
      {showTrigger ? (
        <Button
          label={scope === "editorial" ? "Search content" : "Search admin"}
          tooltip="Search (⌘K / Ctrl+K)"
          size="sm"
          isIconOnly={compact}
          icon={<MagnifyingGlassIcon size={18} aria-hidden="true" />}
          aria-keyshortcuts="Meta+K Control+K"
          onClick={() => {
            previousFocus.current = document.activeElement as HTMLElement;
            setIsOpen(true);
          }}
        />
      ) : null}
      <CommandPalette
        key={attempt}
        isOpen={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) {
            queryRef.current = "";
            setQuery("");
          }
        }}
        searchSource={source}
        input={
          <CommandPaletteInput
            value={query}
            onChange={(event) => {
              queryRef.current = event.currentTarget.value;
              setQuery(event.currentTarget.value);
            }}
            placeholder={
              scope === "editorial" ? "Search content" : "Search admin"
            }
          />
        }
        label="Search admin"
        width="min(680px, calc(100vw - 2 * var(--spacing-4)))"
        maxHeight="min(520px, 80dvh)"
        footer={
          loadError ? (
            <Banner
              status="warning"
              title={loadError}
              endContent={
                <Button
                  label="Retry search"
                  size="sm"
                  onClick={() => {
                    loaded.current = false;
                    setLoadError("");
                    setAttempt((value) => value + 1);
                  }}
                />
              }
            />
          ) : undefined
        }
        onValueChange={(id) => {
          const href = hrefs.current.get(id);
          if (href) window.location.assign(href);
        }}
        renderItem={(item) => (
          <HStack gap={3} vAlign="center" wrap="wrap">
            <VStack gap={1}>
              <Text weight="semibold">{item.label}</Text>
              <Text type="supporting" color="secondary">
                {item.auxiliaryData?.currentFact}
              </Text>
            </VStack>
            <Text type="supporting" color="secondary">
              {item.auxiliaryData?.kind}
            </Text>
          </HStack>
        )}
        emptySearchText="No matching result"
        emptyBootstrapText="No current results"
      />
    </>
  );
}
