import { contentDecision, decisionHref } from "../../lib/content-decision";
import React, { memo, useEffect, useState } from "react";
import type { CatalogRecord, CatalogGroup } from "./EditorialApp";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
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
} from "@astryxdesign/core/DropdownMenu";
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

/** The row link's tooltip carries this string, so it stays bounded rather
 * than listing every changed frontmatter field. */
export function changedFieldSummary(fields: readonly string[]): string {
  if (!fields.length) return "Source changes";
  const shown = fields.slice(0, 2).join(", ");
  return fields.length > 2 ? `${shown} +${fields.length - 2}` : shown;
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

/** The state chip, then a line only when it says something the chip does
 * not. A default state (Published, Listed) shows nothing at all. */
function RecordState({
  record,
  inventoryError,
}: {
  record: CatalogRecord;
  inventoryError: boolean;
}) {
  const decision = contentDecision(record, !inventoryError);
  return (
    <HStack gap={2} vAlign="center" className="editorial-record-state">
      <StateBadge domain="content" state={record.status} />
      {decision.unavailable && <UnavailableMark />}
      {decision.detail && (
        <Text
          type="supporting"
          color="secondary"
          className="editorial-record-state-detail"
        >
          {decision.detail}
        </Text>
      )}
    </HStack>
  );
}

/** Whether a row's state says anything beyond the default. */
function stateIsNews(record: CatalogRecord, inventoryError: boolean) {
  const decision = contentDecision(record, !inventoryError);
  return (
    !badgeFor("content", record.status).isDefault ||
    Boolean(decision.detail) ||
    Boolean(decision.unavailable)
  );
}

export function ContentLibrary({
  groups,
  selectedGroup,
  initialSearch = "",
  inventoryError = false,
  area = "content",
  title,
}: {
  groups: CatalogGroup[];
  selectedGroup?: string;
  initialSearch?: string;
  inventoryError?: boolean;
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
      header: "Title",
      render: (item) => {
        const decision = decisions.get(item)!;
        const changed =
          decision.action === "Review changes" &&
          item.changedFields !== undefined
            ? changedFieldSummary(item.changedFields)
            : undefined;
        return (
          <RowTitle
            icon={recordGlyph(item)[0]}
            kind={recordGlyph(item)[1]}
            title={item.title}
            href={rowHref(item)}
            linkLabel={rowName(item)}
            tooltip={changed ? `${rowName(item)} (${changed})` : rowName(item)}
            mobile={
              stateIsNews(item, inventoryError) ? (
                <RecordState record={item} inventoryError={inventoryError} />
              ) : undefined
            }
            time={item.updated?.at}
          />
        );
      },
    },
    {
      key: "summary",
      header: "Summary",
      hideBelow: "large",
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
    {
      key: "status",
      header: "State",
      width: 200,
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
  ];
  return (
    <WorkspacePage title={heading} count={records.length} actions={actions}>
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
            rows={records}
            columns={columns}
            rowKey="href"
            label={`${library.title} records`}
            noun={["record", "records"]}
            footer={false}
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
            action={
              !inventoryError &&
              group.records.length > 0 &&
              status !== "all" && (
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
