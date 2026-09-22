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
import { Text } from "@astryxdesign/core/Text";
import {
  BriefcaseIcon,
  BrowserIcon,
  EnvelopeSimpleIcon,
  FileTextIcon,
  PencilSimpleIcon,
  XIcon,
  type Icon,
} from "@phosphor-icons/react";
import "./CommandPalette.css";
import "../brand-tile.css";
import {
  searchAdminResults,
  type AdminSearchResult,
} from "../../data/admin-search";
import { providedSearchEntries } from "../../lib/admin-search-index";
import {
  overviewDestination,
  sidebarGroups,
  sidebarSearchEntries,
} from "./UnifiedSidebar";

/** A command the palette runs in place instead of opening a page. */
export type PaletteAction = {
  id: string;
  label: string;
  icon: Icon;
  keywords?: readonly string[];
  run: () => void;
};

type Row = AdminSearchResult & { group: string; icon: Icon; run?: () => void };
type SearchItem = SearchableItem<Row>;

/** Each row leads with the glyph of what it opens: a destination's own
 * sidebar icon, or the kind of Content record. */
const DESTINATION_GLYPHS = new Map<string, Icon>([
  [overviewDestination.href, overviewDestination.icon],
  ...sidebarGroups.flatMap((group) =>
    group.items.map((item) => [item.href, item.icon] as const),
  ),
]);
const KIND_GLYPHS: Readonly<Record<string, Icon>> = {
  pages: BrowserIcon,
  writing: PencilSimpleIcon,
  projects: BriefcaseIcon,
  newsletterDrafts: EnvelopeSimpleIcon,
};
const GROUPS: Readonly<Record<string, string>> = {
  navigation: "Go to",
  content: "Content",
  life: "Data",
  system: "Observability",
};

function toRow(entry: AdminSearchResult): Row {
  return {
    ...entry,
    group: GROUPS[entry.domain] ?? "Results",
    icon:
      DESTINATION_GLYPHS.get(entry.href) ??
      KIND_GLYPHS[entry.kind] ??
      FileTextIcon,
  };
}

function actionRows(actions: readonly PaletteAction[]): Row[] {
  return actions.map(({ id, label, icon, keywords = [], run }) => ({
    id: `action:${id}`,
    label,
    domain: "navigation",
    kind: "action",
    currentFact: "",
    source: "admin",
    freshness: "current",
    href: "",
    keywords: [...keywords],
    group: "Actions",
    icon,
    run,
  }));
}

const toItems = (rows: Row[]): SearchItem[] =>
  rows.map((row) => ({ id: row.id, label: row.label, auxiliaryData: row }));

/**
 * The one command palette, mounted once by the shell and opened with Cmd+K,
 * Ctrl+K or the `admin:search` event (the sidebar and phone search buttons).
 * It finds every sidebar destination, whatever the workspaces have provided
 * (lib/admin-search-index.ts) and the shell's actions. Choosing a page moves
 * within the document when the mounted island draws it.
 */
export function AdminCommandPalette({
  entries,
  actions = [],
}: {
  /** Rows beyond the sidebar destinations and the provided sources. */
  entries?: readonly AdminSearchResult[];
  actions?: readonly PaletteAction[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const queryRef = useRef("");
  const rows = useRef(new Map<string, Row>());
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

  const source = useMemo<SearchSource<SearchItem>>(() => {
    const index = () => [
      ...sidebarSearchEntries.map(toRow),
      ...(entries ?? []).map(toRow),
      ...providedSearchEntries().map(toRow),
    ];
    const commands = actionRows(actions);
    const remember = (found: Row[]) => {
      rows.current = new Map(found.map((row) => [row.id, row]));
      return toItems(found);
    };
    const find = (text: string) => [
      ...(searchAdminResults(index(), text) as Row[]),
      ...(searchAdminResults(commands, text) as Row[]),
    ];
    return {
      bootstrap: () =>
        remember(
          queryRef.current
            ? find(queryRef.current)
            : [...sidebarSearchEntries.map(toRow), ...commands],
        ),
      search: (text) => remember(find(text)),
    };
  }, [entries, actions]);

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
    const field = input.current;
    if (isOpen && dialog.current?.open && field) {
      // A search keyboard with no capitals or corrections. The Astryx input
      // types none of these attributes, so they are set on the element.
      field.inputMode = "search";
      field.enterKeyHint = "go";
      field.autocapitalize = "none";
      field.spellcheck = false;
      field.setAttribute("autocorrect", "off");
      field.focus({ preventScroll: true });
    }
  }, [isOpen]);

  useEffect(() => {
    // On a phone the keyboard covers the bottom of the screen; the palette
    // keeps to what the visual viewport leaves above it.
    const viewport = window.visualViewport;
    if (!isOpen || !viewport) return;
    const root = document.documentElement;
    const fit = () =>
      root.style.setProperty(
        "--admin-visual-viewport-height",
        `${Math.round(viewport.height)}px`,
      );
    fit();
    viewport.addEventListener("resize", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      root.style.removeProperty("--admin-visual-viewport-height");
    };
  }, [isOpen]);

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
    <CommandPalette
      ref={dialog}
      onKeyDownCapture={(event) => {
        // Keep composition cancellation inside the input; the palette input's
        // Escape handler runs before the dialog's own composition guard.
        if (event.key === "Escape" && event.nativeEvent.isComposing)
          event.stopPropagation();
      }}
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
              isIconOnly
              label="Clear search"
              size="md"
              variant="ghost"
              icon={<XIcon size={18} aria-hidden="true" />}
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
          placeholder="Search admin"
        />
      }
      label="Search admin"
      width="min(600px, calc(100vw - 2 * var(--spacing-3)))"
      maxHeight="var(--admin-palette-max-height)"
      footer={<CommandPaletteFooter className="admin-palette-keys" />}
      onValueChange={(id) => {
        const row = rows.current.get(id);
        if (row?.run) row.run();
        else if (row?.href) navigateAdmin(row.href);
      }}
      renderItem={(item) => {
        const Glyph = item.auxiliaryData?.icon ?? FileTextIcon;
        return (
          <HStack gap={3} vAlign="center" className="admin-palette-result">
            <span className="brand-tile admin-palette-tile" aria-hidden="true">
              <Glyph className="brand-tile-glyph" weight="regular" />
            </span>
            <Text className="admin-palette-result-label">{item.label}</Text>
          </HStack>
        );
      }}
      emptySearchText="No matches"
      emptyBootstrapText="Nothing to open"
    />
  );
}
