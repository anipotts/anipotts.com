import { navigateAdmin } from "../../lib/editorial-navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CommandPalette,
  CommandPaletteInput,
  CommandPaletteFooter,
} from "@astryxdesign/core/CommandPalette";
import type {
  SearchableItem,
  SearchSource,
} from "@astryxdesign/core/Typeahead";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { ArrowRightIcon, MagnifyingGlassIcon } from "../admin-icons";
import "./CommandPalette.css";
import type { NavItem } from "../../data/admin";
import {
  searchAdminResults,
  type AdminSearchResult,
} from "../../data/admin-search";

type SearchItem = SearchableItem<AdminSearchResult & { group: string }>;

type Props = {
  navItems: NavItem[];
  searchableNavItems?: NavItem[];
  showTrigger?: boolean;
  entries?: AdminSearchResult[];
  loadEntries?: () => Promise<AdminSearchResult[]>;
  compact?: boolean;
  scope?: "editorial" | "operational";
};

const titleCase = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);
const EMPTY_NAV_ITEMS: NavItem[] = [];

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
      group: row.domain === "navigation" ? "Go to" : titleCase(row.domain),
    },
  }));
}

export function AdminCommandPalette({
  navItems,
  searchableNavItems = EMPTY_NAV_ITEMS,
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
    () => [
      ...navResults(navItems),
      ...navResults(searchableNavItems),
      ...(entries ?? []),
    ],
    [navItems, searchableNavItems, entries],
  );
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const loaded = useRef(false);
  const loading = useRef<Promise<void> | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const dismissalFocus = useRef<HTMLElement | null>(null);
  const closing = useRef(false);
  useEffect(() => {
    const preserveLaterFocus = (event: FocusEvent) => {
      const target = event.target;
      if (
        closing.current &&
        target instanceof HTMLElement &&
        target !== document.body &&
        target !== previousFocus.current &&
        !dialog.current?.contains(target)
      )
        dismissalFocus.current = target;
    };
    document.addEventListener("focusin", preserveLaterFocus);
    return () => document.removeEventListener("focusin", preserveLaterFocus);
  }, []);
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
            : [...navResults(navItems), ...(entries ?? [])].slice(0, 18),
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
  }, [staticRows, navItems, entries, loadEntries, attempt]);

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
        if (
          document.activeElement?.closest(
            'input, textarea, [contenteditable="true"]',
          )
        )
          return;
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
    // The installed input schedules uncancelled animation-frame autofocus.
    // Own it here, after the child opens its native dialog, so a rapid close
    // cannot leave a delayed opening callback that steals restored focus.
    if (isOpen && dialog.current?.open) {
      input.current?.focus({ preventScroll: true });
    }
  }, [isOpen, attempt]);

  useEffect(() => {
    if (wasOpen.current && !isOpen) {
      // Astryx restores its trigger during the child close effect. Preserve a
      // deliberate outside focus target captured before that restoration.
      const active = document.activeElement;
      const target = dismissalFocus.current ?? previousFocus.current;
      if (
        target?.isConnected &&
        active !== target &&
        (!active ||
          active === document.body ||
          active === previousFocus.current ||
          dialog.current?.contains(active))
      ) {
        target.focus({ preventScroll: true });
      }
      dismissalFocus.current = null;
      closing.current = false;
    }
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
        ref={dialog}
        onKeyDownCapture={(event) => {
          // Keep composition cancellation inside the input; the palette input's
          // Escape handler runs before the dialog's own composition guard.
          if (event.key === "Escape" && event.nativeEvent.isComposing)
            event.stopPropagation();
        }}
        key={attempt}
        className="admin-command-palette-centered"
        isOpen={isOpen}
        onOpenChange={(open) => {
          closing.current = !open;
          if (!open) {
            const active = document.activeElement;
            dismissalFocus.current =
              active instanceof HTMLElement &&
              active !== document.body &&
              !dialog.current?.contains(active)
                ? active
                : null;
          }
          setIsOpen(open);
          if (!open) {
            queryRef.current = "";
            setQuery("");
          }
        }}
        searchSource={source}
        input={
          <CommandPaletteInput
            ref={input}
            hasAutoFocus={false}
            endContent={
              <Button
                className="admin-palette-clear"
                data-empty={!query}
                aria-hidden={!query}
                tabIndex={query ? 0 : -1}
                isDisabled={!query}
                label="Clear"
                size="sm"
                variant="ghost"
                onClick={() => {
                  queryRef.current = "";
                  setQuery("");
                  input.current?.focus({ preventScroll: true });
                }}
              />
            }
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
        width="min(600px, calc(100vw - 2 * var(--spacing-4)))"
        maxHeight="min(520px, 80dvh)"
        footer={
          <VStack gap={0}>
            {loadError ? (
              <HStack gap={3} vAlign="center" className="admin-palette-error">
                <Text role="status" color="secondary">
                  Search unavailable
                </Text>
                <Button
                  label="Retry search"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    loaded.current = false;
                    setLoadError("");
                    setAttempt((value) => value + 1);
                  }}
                />
              </HStack>
            ) : null}
            <CommandPaletteFooter />
          </VStack>
        }
        onValueChange={(id) => {
          const href = hrefs.current.get(id);
          if (href) navigateAdmin(href);
        }}
        renderItem={(item) => (
          <HStack gap={3} vAlign="center" className="admin-palette-result">
            <VStack gap={1} className="admin-palette-result-copy">
              <Text weight="semibold">{item.label}</Text>
              {item.auxiliaryData?.domain !== "navigation" &&
              item.auxiliaryData?.currentFact ? (
                <Text
                  type="supporting"
                  color="secondary"
                  className="admin-palette-result-description"
                >
                  {item.auxiliaryData?.currentFact}
                </Text>
              ) : null}
            </VStack>
            {item.auxiliaryData?.domain !== "navigation" ? (
              <Text
                type="supporting"
                color="secondary"
                className="admin-palette-result-kind"
              >
                {item.auxiliaryData?.kind}
              </Text>
            ) : (
              <ArrowRightIcon
                aria-hidden="true"
                className="admin-palette-result-arrow"
              />
            )}
          </HStack>
        )}
        emptySearchText="No matches"
        emptyBootstrapText="No available destinations"
      />
    </>
  );
}
