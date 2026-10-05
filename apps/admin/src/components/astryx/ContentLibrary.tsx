import {
  ContentRecordMark,
  PendingChangesIndicator,
} from "../workspace/Workspace";
import { contentDecision, decisionHref } from "../../lib/content-decision";
import React, { memo, useEffect, useState } from "react";
import type { CatalogRecord, CatalogGroup } from "./EditorialApp";
import { Button } from "./WritingControls";
import { IconButton } from "./WritingControls";
import {
  ArticleIcon,
  BriefcaseIcon,
  CloudSlashIcon,
  EnvelopeIcon,
  FileTextIcon,
  FunnelSimpleIcon,
  PlusIcon,
  SortAscendingIcon,
  XIcon,
  type Icon,
} from "@phosphor-icons/react";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "./WritingControls";
import {
  DataTable,
  FilterBar,
  FilterMenu,
  RelativeTime,
  RowTitle,
  StateBadge,
  StateNotice,
  WorkspacePage,
  badgeFor,
  leadWidth,
  type Column,
} from "../workspace/Workspace";
import {
  LIBRARY_STATUSES,
  SORT_LABELS,
  readLibraryState,
  libraryStateUrl,
  recordLibraryHref,
  type LibrarySort,
  type LibraryState,
} from "../../lib/content-library-state";

/** A record's address segment, so a search finds it by its slug too. */
const recordSlug = (record: CatalogRecord) =>
  record.publishedSlug ??
  record.id ??
  decodeURIComponent(record.href.split("?")[0]!.split("/").pop() ?? "");

export function matchingRecords(
  records: CatalogRecord[],
  query: string,
  status: string,
): CatalogRecord[] {
  const text = query.trim().toLocaleLowerCase();
  return records.filter(
    (record) =>
      (status === "all" ||
        (status === "changes"
          ? record.changesPending
          : record.status === status)) &&
      `${record.title} ${record.summary ?? ""} ${recordSlug(record)}`
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

const UPDATE_LABELS: Record<string, string> = {
  cms: "Published",
  hidden: "Hidden from site",
  private: "Private draft saved",
  local: "Local edit",
  git: "Latest Git change",
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
      <RelativeTime value={updated.at} label={UPDATE_LABELS[updated.source]} />
      {updated.source === "local" && (
        <Text type="supporting" color="secondary">
          Local edit
        </Text>
      )}
    </HStack>
  );
}

/** Library rows re-render whenever the island commits. Skipping renders when
 * the recorded time and source are unchanged keeps rows still; the shared
 * live clock still advances the relative text. */
export const Updated = memo(
  UpdatedCell,
  (previous, next) =>
    previous.column === next.column &&
    previous.updated?.at === next.updated?.at &&
    previous.updated?.source === next.updated?.source,
);

/** A status filter's one name: the chip's label, from the badge table. */
function statusLabel(value: string) {
  return value === "all"
    ? "All"
    : value === "changes"
      ? "Changes pending"
      : badgeFor("content", value).label;
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
      <StateBadge domain="content" state={status} />
      {changesPending && (
        <Text type="supporting" color="secondary">
          Changes pending
        </Text>
      )}
    </VStack>
  );
}

/** Each library's kind: its glyph, its name, its title and what it creates. */
const LIBRARIES: Record<
  string,
  { icon: Icon; kind: string; title: string; create?: [string, string] }
> = {
  website: { icon: FileTextIcon, kind: "Page", title: "Pages" },
  writing: {
    icon: ArticleIcon,
    kind: "Article",
    title: "Writing",
    create: ["New article", "/content/new"],
  },
  work: {
    icon: BriefcaseIcon,
    kind: "Project",
    title: "Projects",
    create: ["New project", "/content/new-project"],
  },
  newsletter: {
    icon: EnvelopeIcon,
    kind: "Newsletter issue",
    title: "Newsletter",
  },
};

/** The record's kind, as a glyph and its name. */
function recordGlyph(record: CatalogRecord): [Icon, string] {
  const library =
    record.collection === "projects" ||
    record.href.startsWith("/content/projects/")
      ? LIBRARIES.work!
      : record.collection === "writing" ||
          record.href.startsWith("/content/writing/")
        ? LIBRARIES.writing!
        : record.href.startsWith("/newsletter/")
          ? LIBRARIES.newsletter!
          : LIBRARIES.website!;
  return [library.icon, library.kind];
}

/** The private draft state could not be read: a glyph, named on hover. */
function UnavailableMark() {
  return (
    <span
      className="editorial-record-unavailable"
      role="img"
      aria-label="Draft status unavailable"
      title="Draft status unavailable"
    >
      <CloudSlashIcon weight="regular" aria-hidden="true" />
    </span>
  );
}

export function ContentLibrary({
  groups,
  selectedGroup,
  initialSearch = "",
  inventoryError = false,
  siteUrl,
  area = "content",
  title,
}: {
  groups: CatalogGroup[];
  selectedGroup?: string;
  initialSearch?: string;
  inventoryError?: boolean;
  siteUrl?: string;
  area?: "content" | "newsletter";
  /** The page's H1. Defaults to the library's name. */
  title?: string;
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
  const library = LIBRARIES[group?.name ?? ""] ?? LIBRARIES.website!;
  const noun: [string, string] = [
    library.kind.toLowerCase(),
    `${library.kind.toLowerCase()}s`,
  ];
  const heading = title ?? library.title;
  const create = area === "content" ? library.create : undefined;
  const actions = create && (
    <IconButton
      label={create[0]}
      tooltip={create[0]}
      variant="ghost"
      icon={<PlusIcon weight="regular" aria-hidden="true" />}
      href={create[1]}
      className="editorial-library-create"
    />
  );
  if (!group)
    return (
      <WorkspacePage title={heading} actions={actions}>
        <StateNotice
          kind={inventoryError ? "error" : "empty"}
          icon={inventoryError ? undefined : library.icon}
          title={inventoryError ? "Records unavailable" : "No records yet"}
        />
      </WorkspacePage>
    );
  const { q: query, status } = state;
  const decisions = new Map(
    group.records.map((item) => [item, contentDecision(item, !inventoryError)]),
  );
  // Needs attention only reorders when records differ in what they need.
  const attentionSorts =
    new Set([...decisions.values()].map((decision) => decision.priority)).size >
    1;
  const defaultSort: LibrarySort = attentionSorts ? "attention" : "updated";
  const sort: LibrarySort =
    !attentionSorts && state.sort === "attention" ? "updated" : state.sort;
  const matched = matchingRecords(group.records, query, status);
  const records =
    sort === "title"
      ? [...matched].sort(
          (a, b) =>
            a.title.localeCompare(b.title) || a.href.localeCompare(b.href),
        )
      : sort === "attention"
        ? recentlyUpdated(matched).sort(
            (a, b) => decisions.get(a)!.priority - decisions.get(b)!.priority,
          )
        : recentlyUpdated(matched);
  const present = new Set(group.records.map((item) => item.status));
  const statusOptions = [
    ...(group.records.some((item) => item.changesPending) ? ["changes"] : []),
    ...LIBRARY_STATUSES.filter((item) => present.has(item)),
    ...[...present]
      .filter((item) => !(LIBRARY_STATUSES as readonly string[]).includes(item))
      .sort(),
  ];
  const filtered = status !== "all" || sort !== defaultSort;
  const reset = () => change({ status: "all", sort: "attention" });
  const rowHref = (item: CatalogRecord) => {
    const href = recordLibraryHref(item.href, currentUrl);
    const view = decisions.get(item)?.view;
    return view ? decisionHref(href, view) : href;
  };
  const rowName = (item: CatalogRecord) =>
    `${decisions.get(item)?.action ?? "Open record"}: ${item.title}`;
  const columns: Column<CatalogRecord>[] = [
    {
      key: "title",
      priority: 0,
      header: "Title",
      render: (item) => {
        const decision = decisions.get(item)!;
        const pending = item.changesPending && !decision.unavailable;
        const transition =
          decision.detail && decision.detail !== "Unpublished edits"
            ? decision.detail
            : undefined;
        return (
          <RowTitle
            icon={group.name === "writing" ? undefined : recordGlyph(item)[0]}
            mark={
              group.name === "work" ? (
                <ContentRecordMark record={item} siteUrl={siteUrl} />
              ) : undefined
            }
            kind={recordGlyph(item)[1]}
            title={item.title}
            href={rowHref(item)}
            linkLabel={
              pending
                ? `${rowName(item)}, Unpublished changes${transition ? `: ${transition}` : ""}`
                : rowName(item)
            }
            tooltip={
              pending
                ? `${rowName(item)}: ${transition ?? "Unpublished changes"}`
                : rowName(item)
            }
            wrap={false}
            tooltipOnFocus={Boolean(pending)}
            titleIndicator={
              <PendingChangesIndicator pending={Boolean(pending)} />
            }
            secondary={
              (decision.detail && !item.changesPending) ||
              decision.unavailable ? (
                <span className="editorial-record-exception">
                  {decision.unavailable && <UnavailableMark />}
                  {!item.changesPending && decision.detail}
                </span>
              ) : undefined
            }
            time={item.updated?.at}
          />
        );
      },
    },
    {
      key: "summary",
      compact: "detail",
      compactLabel: false,
      priority: 1,
      min: 200,
      header: "Summary",
      hideBelow: "large",
      // The summary is a teaser and gives way first: the titles keep room
      // for the library's longest, so a search never moves the columns.
      share: 0.5,
      // Up to the library's longest title, so no title wraps while the
      // summary beside it still has room.
      reserve: leadWidth(
        group.records.map((item) => item.title),
        { max: 520 },
      ),
      render: (item) =>
        item.summary ? (
          <Text
            type="supporting"
            color="secondary"
            className="editorial-record-summary"
          >
            {/* A teaser gives way first, but after a whole word. */}
            <span title={item.summary}>{item.summary}</span>
          </Text>
        ) : null,
    },
    {
      key: "updated",
      compact: "trailing",
      compactLabel: false,
      priority: 2,
      header: "Last activity",
      width: 120,
      render: (item) => <Updated updated={item.updated} column />,
    },
  ];
  return (
    <WorkspacePage
      title={heading}
      count={group.records.length}
      countNoun={noun}
      actions={actions}
    >
      <VStack gap={5} className="editorial-library">
        <FilterBar
          search={{
            label: `Search ${library.title.toLocaleLowerCase()}`,
            value: query,
            onChange: (q) => change({ q }, true),
          }}
        >
          {statusOptions.length > 1 && (
            <FilterMenu
              label="Status"
              icon={FunnelSimpleIcon}
              value={statusLabel(status)}
              isActive={status !== "all"}
            >
              <DropdownMenuRadioGroup
                label="Status"
                value={status}
                onChange={(next) => change({ status: next })}
              >
                {["all", ...statusOptions].map((item) => (
                  <DropdownMenuRadioItem
                    key={item}
                    value={item}
                    label={statusLabel(item)}
                  />
                ))}
              </DropdownMenuRadioGroup>
            </FilterMenu>
          )}
          <FilterMenu
            label="Sort"
            icon={SortAscendingIcon}
            value={SORT_LABELS[sort]}
            isActive={sort !== defaultSort}
          >
            <DropdownMenuRadioGroup
              label="Sort"
              value={sort}
              onChange={(next) =>
                change({
                  sort:
                    next === "title" || next === "updated" ? next : "attention",
                })
              }
            >
              {(attentionSorts
                ? (["attention", "updated", "title"] as const)
                : (["updated", "title"] as const)
              ).map((item) => (
                <DropdownMenuRadioItem
                  key={item}
                  value={item}
                  label={SORT_LABELS[item]}
                />
              ))}
            </DropdownMenuRadioGroup>
          </FilterMenu>
          {filtered && (
            <IconButton
              label="Reset filters"
              tooltip="Reset filters"
              variant="ghost"
              size="sm"
              icon={<XIcon weight="regular" aria-hidden="true" />}
              onClick={reset}
            />
          )}
        </FilterBar>
        {records.length ? (
          <DataTable
            tableId={`content-${group.name}`}
            totalCount={group.records.length}
            filteredCount={
              query || status !== "all" ? matched.length : undefined
            }
            groupTotals={Object.fromEntries(
              [...new Set(group.records.map((record) => record.status))].map(
                (status) => [
                  status,
                  group.records.filter((record) => record.status === status)
                    .length,
                ],
              ),
            )}
            searchActive={Boolean(query || status !== "all")}
            groupBy={(row) => row.status}
            groupLabel={(key) =>
              key === "published"
                ? "Published"
                : key === "draft"
                  ? "Drafts"
                  : key === "unpublished"
                    ? "Unpublished"
                    : badgeFor("content", key).label
            }
            rows={records}
            columns={columns}
            rowKey="href"
            label={`${library.title} records`}
            noun={noun}
          />
        ) : (
          <StateNotice
            kind={inventoryError ? "error" : "empty"}
            icon={inventoryError ? undefined : library.icon}
            title={
              inventoryError
                ? "Records unavailable"
                : group.records.length === 0
                  ? "No records yet"
                  : "No matching records"
            }
            description={
              !inventoryError && group.records.length > 0
                ? `0 matching of ${group.records.length}`
                : undefined
            }
            action={
              !inventoryError &&
              group.records.length > 0 &&
              (query || status !== "all") && (
                <Button
                  label="Clear filters"
                  onClick={() => change({ q: "", status: "all" })}
                />
              )
            }
          />
        )}
      </VStack>
    </WorkspacePage>
  );
}
