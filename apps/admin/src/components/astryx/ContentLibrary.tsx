import { contentDecision, decisionHref } from "../../lib/content-decision";
import React, { memo, useEffect, useState } from "react";
import type { CatalogRecord, CatalogGroup } from "./EditorialApp";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import {
  ArrowRightIcon,
  ArticleIcon,
  BriefcaseIcon,
  EnvelopeIcon,
  FileTextIcon,
  type Icon,
} from "@phosphor-icons/react";
import { Token } from "@astryxdesign/core/Token";
import {
  Timestamp,
  type TimestampTooltipEntry,
} from "@astryxdesign/core/Timestamp";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import {
  DataTable,
  FilterBar,
  RowTitle,
  StateBadge,
  StateNotice,
  type Column,
} from "../workspace/Workspace";
import {
  readLibraryState,
  libraryStateUrl,
  recordLibraryHref,
  type LibraryState,
} from "../../lib/content-library-state";
export function matchingRecords(
  records: CatalogRecord[],
  query: string,
  status: string,
  sections?: string[],
): CatalogRecord[] {
  const text = query.trim().toLocaleLowerCase();
  return records.filter(
    (record) =>
      (status === "all" ||
        (status === "changes"
          ? record.changesPending
          : record.status === status)) &&
      (sections === undefined || sections.includes(record.section ?? "")) &&
      `${record.title} ${record.summary ?? ""} ${record.section ?? ""}`
        .toLocaleLowerCase()
        .includes(text),
  );
}

export function recentlyUpdated(records: CatalogRecord[]): CatalogRecord[] {
  const latest = (record: CatalogRecord): number =>
    Date.parse(record.updated?.at ?? "") || 0;
  return [...records].sort(
    (a, b) =>
      latest(b) - latest(a) ||
      a.title.localeCompare(b.title) ||
      a.href.localeCompare(b.href),
  );
}

type UpdatedSource = NonNullable<CatalogRecord["updated"]>["source"];

/** One shared tooltip entry list per source, so every render hands Timestamp
 * the same array instead of a new one per cell. */
const UPDATED_TOOLTIP_ENTRIES: Record<
  UpdatedSource,
  ReadonlyArray<TimestampTooltipEntry>
> = {
  private: [
    { label: "Private draft saved", timezoneID: "local", format: "full" },
  ],
  local: [{ label: "Local edit", timezoneID: "local", format: "full" }],
  git: [{ label: "Latest Git change", timezoneID: "local", format: "full" }],
};

function UpdatedCell({
  updated,
  column = false,
}: {
  updated: CatalogRecord["updated"];
  column?: boolean;
}) {
  if (!updated)
    return column ? <Text color="secondary">Not recorded</Text> : null;
  const date = new Date(updated.at);
  if (!Number.isFinite(date.getTime()))
    return column ? <Text color="secondary">Not recorded</Text> : null;
  return (
    <HStack gap={2} wrap="wrap">
      <Timestamp
        value={updated.at}
        format="relative_short"
        isLive
        tooltipEntries={
          UPDATED_TOOLTIP_ENTRIES[updated.source] ?? UPDATED_TOOLTIP_ENTRIES.git
        }
      />
      {updated.source === "local" && (
        <Text type="supporting" color="secondary">
          Local edit
        </Text>
      )}
    </HStack>
  );
}

/** Library rows re-render whenever the island commits, and each Timestamp
 * holds a dehydrated Suspense boundary for its lazy hover card. Skipping
 * renders when the recorded time and source are unchanged keeps React from
 * hydrating every boundary again at sync priority after the first commit.
 * Timestamp keeps its own live clock, so the relative text still advances. */
export const Updated = memo(
  UpdatedCell,
  (previous, next) =>
    previous.column === next.column &&
    previous.updated?.at === next.updated?.at &&
    previous.updated?.source === next.updated?.source,
);

/** States whose plain name would undersell where the record stands. */
const STATUS_LABELS: Record<string, string> = {
  hidden: "Hidden from site",
};

function interfaceLabel(value: string) {
  if (STATUS_LABELS[value]) return STATUS_LABELS[value];
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Statuses the public site shows. Their chip is tinted; every other state
 * stays neutral, so colour in a table always means "live on the site". */
const PUBLIC_STATUSES = ["published", "featured", "listed"];

/** Figures for the strip under a library table. Only non-zero figures render,
 * so a filtered view describes what is in it rather than listing every state. */
export function libraryFigures(records: readonly CatalogRecord[]) {
  const count = (test: (record: CatalogRecord) => boolean) =>
    records.filter(test).length;
  const figures: Array<[label: string, value: number]> = [
    ["public", count((record) => PUBLIC_STATUSES.includes(record.status))],
    ["drafts", count((record) => record.status === "draft")],
    ["hidden", count((record) => record.status === "hidden")],
    ["with changes pending", count((record) => Boolean(record.changesPending))],
  ];
  return figures.filter(([, value]) => value > 0);
}

export function RecordStatus({
  status,
  changesPending,
}: {
  status: string;
  changesPending?: boolean;
}) {
  return (
    <VStack gap={1}>
      <StateBadge
        tone={PUBLIC_STATUSES.includes(status) ? "positive" : "neutral"}
        label={interfaceLabel(status)}
      />
      {changesPending && (
        <Text type="supporting" color="secondary">
          Changes pending
        </Text>
      )}
    </VStack>
  );
}

/** The record's library section, derived from its URL when rows omit it. */
export function recordSection(record: CatalogRecord): string {
  return (
    record.section ??
    (record.href.startsWith("/content/projects/")
      ? "Projects"
      : record.href.startsWith("/content/writing/")
        ? "Writing"
        : record.href.startsWith("/newsletter/")
          ? "Newsletter"
          : "Pages")
  );
}

/** The record's kind, as a glyph and its name. */
function recordGlyph(record: CatalogRecord): [Icon, string] {
  return record.collection === "projects" ||
    record.href.startsWith("/content/projects/")
    ? [BriefcaseIcon, "Project"]
    : record.collection === "writing" ||
        record.href.startsWith("/content/writing/")
      ? [ArticleIcon, "Article"]
      : record.href.startsWith("/newsletter/")
        ? [EnvelopeIcon, "Newsletter issue"]
        : [FileTextIcon, "Page"];
}

/** The row action's tooltip and aria-describedby both carry this string, and a
 * screen reader reads it on every focus, so it stays bounded rather than
 * listing every changed frontmatter field. */
export function changedFieldSummary(fields: readonly string[]): string {
  if (!fields.length) return "Source changes";
  const shown = fields.slice(0, 2).join(", ");
  return fields.length > 2 ? `${shown} +${fields.length - 2}` : shown;
}

function RecordState({
  record,
  inventoryError,
}: {
  record: CatalogRecord;
  inventoryError: boolean;
}) {
  const decision = contentDecision(record, !inventoryError);
  const unavailable = inventoryError && record.privateRevision === undefined;
  return (
    <HStack gap={2} vAlign="center" className="editorial-record-state">
      <RecordStatus status={record.status} />
      <Text
        type="supporting"
        color="secondary"
        className="editorial-record-state-detail"
      >
        {unavailable
          ? "Draft status unavailable"
          : (decision.detail ?? decision.label)}
      </Text>
    </HStack>
  );
}

function RecordAction({
  record,
  returnTo,
  inventoryError = false,
}: {
  record: CatalogRecord;
  returnTo: string;
  inventoryError?: boolean;
}) {
  const decision = contentDecision(record, !inventoryError);
  const changed =
    decision.action === "Review changes" && record.changedFields !== undefined
      ? changedFieldSummary(record.changedFields)
      : undefined;
  const label = `${decision.action ?? "Open record"}: ${record.title}`;
  const href = recordLibraryHref(record.href, returnTo);
  return (
    <IconButton
      size="sm"
      variant="ghost"
      className="editorial-record-action"
      icon={<ArrowRightIcon weight="regular" />}
      label={label}
      tooltip={changed ? `${label} (${changed})` : label}
      href={decision.view ? decisionHref(href, decision.view) : href}
    />
  );
}

export function ContentLibrary({
  groups,
  selectedGroup,
  initialSearch = "",
  inventoryError = false,
  area = "content",
}: {
  groups: CatalogGroup[];
  selectedGroup?: string;
  initialSearch?: string;
  inventoryError?: boolean;
  area?: "content" | "newsletter";
}) {
  const home = area === "newsletter" ? "/content/newsletter" : "/content";
  const [state, setState] = useState<LibraryState>(() =>
    readLibraryState(initialSearch, selectedGroup),
  );
  const [currentUrl, setCurrentUrl] = useState(() =>
    libraryStateUrl(
      home,
      initialSearch,
      readLibraryState(initialSearch, selectedGroup),
    ),
  );
  useEffect(() => {
    const restore = () => {
      const next = readLibraryState(window.location.search, selectedGroup);
      setState(next);
      setCurrentUrl(
        libraryStateUrl(window.location.pathname, window.location.search, next),
      );
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [selectedGroup]);
  const change = (patch: Partial<LibraryState>, replace = false) => {
    const next = { ...state, ...patch };
    const url = libraryStateUrl(
      window.location.pathname,
      window.location.search,
      next,
    );
    setState(next);
    setCurrentUrl(url);
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history[replace ? "replaceState" : "pushState"](
        window.history.state,
        "",
        url,
      );
      window.dispatchEvent(new Event("editorial:library-state"));
    }
  };
  const group =
    groups.find((item) => item.name === state.group) ??
    groups.find((item) => item.name === selectedGroup) ??
    groups[0];
  const { q: query, status } = state;
  const sectionOptions = [
    ...new Set(
      group?.records.flatMap((item) => (item.section ? [item.section] : [])) ??
        [],
    ),
  ].sort();
  const sections = state.sections ?? sectionOptions;
  const setQuery = (q: string) => change({ q }, true);
  const setStatus = (status: string) => change({ status });
  const setSections = (sections: string[]) => change({ sections });
  if (!group)
    return (
      <StateNotice
        kind={inventoryError ? "error" : "empty"}
        title={inventoryError ? "Records unavailable" : "No records yet"}
      />
    );
  const matched = matchingRecords(
    group.records,
    query,
    status,
    sectionOptions.length > 1 ? sections : undefined,
  );
  const records =
    state.sort === "title"
      ? [...matched].sort(
          (a, b) =>
            a.title.localeCompare(b.title) || a.href.localeCompare(b.href),
        )
      : state.sort === "attention"
        ? recentlyUpdated(matched).sort(
            (a, b) =>
              contentDecision(a, !inventoryError).priority -
              contentDecision(b, !inventoryError).priority,
          )
        : recentlyUpdated(matched);
  // One library of one kind needs no kind column; a mixed library does.
  const showSections =
    new Set(group.records.map((item) => recordSection(item))).size > 1;
  const statuses = [...new Set(group.records.map((item) => item.status))];
  const columns: Column<CatalogRecord>[] = [
    {
      key: "title",
      header: "Title",
      render: (item) => (
        <RowTitle
          icon={recordGlyph(item)[0]}
          kind={recordGlyph(item)[1]}
          title={item.title}
          href={recordLibraryHref(item.href, currentUrl)}
          mobile={
            <>
              <RecordState record={item} inventoryError={inventoryError} />
              <Updated updated={item.updated} column />
            </>
          }
        />
      ),
    },
    {
      key: "summary",
      header: "Summary",
      hideBelow: 1280,
      render: (item) =>
        item.summary ? (
          <Text
            type="supporting"
            color="secondary"
            className="editorial-record-summary"
          >
            {item.summary}
          </Text>
        ) : null,
    },
    ...(showSections
      ? [
          {
            key: "section",
            header: "Kind",
            width: 124,
            hideBelow: 1024 as const,
            render: (item: CatalogRecord) => (
              <Token
                size="sm"
                color="default"
                className="editorial-record-kind"
                label={interfaceLabel(recordSection(item))}
              />
            ),
          },
        ]
      : []),
    {
      key: "status",
      header: "State",
      width: 228,
      render: (item) => (
        <RecordState record={item} inventoryError={inventoryError} />
      ),
    },
    {
      key: "updated",
      header: "Updated",
      width: 112,
      render: (item) => <Updated updated={item.updated} column />,
    },
    {
      key: "action",
      header: <Text className="sr-only">Action</Text>,
      width: 52,
      align: "end",
      render: (item) => (
        <RecordAction
          record={item}
          returnTo={currentUrl}
          inventoryError={inventoryError}
        />
      ),
    },
  ];
  return (
    <VStack gap={5} className="editorial-library">
      <FilterBar
        search={{ label: "Search records", value: query, onChange: setQuery }}
      >
        {sectionOptions.length > 1 && (
          <DropdownMenu
            button={{
              label:
                sections.length === sectionOptions.length
                  ? "Sections"
                  : sections.length === 0
                    ? "No sections"
                    : sections.length === 1
                      ? interfaceLabel(sections[0]!)
                      : `${sections.length} sections`,
              size: "sm",
              variant: "secondary",
            }}
          >
            <DropdownMenuCheckboxItem
              label="All sections"
              value={sections.length === sectionOptions.length}
              onChange={(checked) => setSections(checked ? sectionOptions : [])}
            />
            {sectionOptions.map((section) => (
              <DropdownMenuCheckboxItem
                key={section}
                label={interfaceLabel(section)}
                value={sections.includes(section)}
                onChange={(checked) =>
                  setSections(
                    checked
                      ? [...sections, section]
                      : sections.filter((item) => item !== section),
                  )
                }
              />
            ))}
          </DropdownMenu>
        )}
        {(statuses.length > 1 ||
          group.records.some((item) => item.changesPending)) && (
          <DropdownMenu
            button={{
              label:
                status === "all"
                  ? "Status"
                  : status === "changes"
                    ? "Changes"
                    : interfaceLabel(status),
              tooltip: `Status: ${status === "all" ? "All" : status === "changes" ? "Changes pending" : interfaceLabel(status)}`,
              size: "sm",
              variant: "secondary",
            }}
            menuWidth="max-content"
          >
            <DropdownMenuRadioGroup
              label="Publication status"
              value={status}
              onChange={setStatus}
            >
              {[
                "all",
                ...(group.records.some((item) => item.changesPending)
                  ? ["changes"]
                  : []),
                ...statuses,
              ].map((item) => (
                <DropdownMenuRadioItem
                  key={item}
                  value={item}
                  label={
                    item === "changes"
                      ? "Changes pending"
                      : interfaceLabel(item)
                  }
                />
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenu>
        )}
        <DropdownMenu
          button={{
            label:
              state.sort === "attention"
                ? "Needs attention"
                : state.sort === "updated"
                  ? "Recently edited"
                  : "Title A to Z",
            tooltip: `Sort: ${state.sort === "attention" ? "Needs attention" : state.sort === "updated" ? "Last updated" : "Title"}`,
            size: "sm",
            variant: "secondary",
          }}
        >
          <DropdownMenuRadioGroup
            label="Sort records"
            value={state.sort}
            onChange={(sort) =>
              change({
                sort:
                  sort === "title"
                    ? "title"
                    : sort === "updated"
                      ? "updated"
                      : "attention",
              })
            }
          >
            <DropdownMenuRadioItem value="attention" label="Needs attention" />
            <DropdownMenuRadioItem value="updated" label="Last updated" />
            <DropdownMenuRadioItem value="title" label="Title" />
          </DropdownMenuRadioGroup>
        </DropdownMenu>
      </FilterBar>
      {records.length ? (
        <DataTable
          rows={records}
          columns={columns}
          rowKey="href"
          label={`${interfaceLabel(group.name)} records`}
          noun={["record", "records"]}
          figures={libraryFigures(records)}
        />
      ) : (
        <StateNotice
          kind={inventoryError ? "error" : "empty"}
          title={
            inventoryError
              ? "Records unavailable"
              : group.records.length === 0
                ? "No records yet"
                : "No matching records"
          }
          action={
            inventoryError ? undefined : group.records.length === 0 ? (
              area === "content" && ["writing", "work"].includes(group.name) ? (
                <Button
                  label={group.name === "work" ? "New project" : "New article"}
                  href={
                    group.name === "work"
                      ? "/content/new-project"
                      : "/content/new"
                  }
                />
              ) : undefined
            ) : (
              <Button
                label="Clear filters"
                onClick={() => {
                  change({ q: "", status: "all", sections: undefined });
                }}
              />
            )
          }
        />
      )}
    </VStack>
  );
}
