import { contentDecision, decisionHref } from "../../lib/content-decision";
import React, { useEffect, useState } from "react";
import type { CatalogRecord, CatalogGroup } from "./EditorialApp";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import {
  ArrowRightIcon,
  ArticleIcon,
  BriefcaseIcon,
  EnvelopeIcon,
  FileTextIcon,
} from "@phosphor-icons/react";
import { Token } from "@astryxdesign/core/Token";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Table, proportional, pixel } from "@astryxdesign/core/Table";
import { StatusDot } from "@astryxdesign/core/StatusDot";
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

export function Updated({
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
        tooltipEntries={[
          {
            label:
              updated.source === "private"
                ? "Private draft saved"
                : updated.source === "local"
                  ? "Local edit"
                  : "Latest Git change",
            timezoneID: "local",
            format: "full",
          },
        ]}
      />
      {updated.source === "local" && (
        <Text type="supporting" color="secondary">
          Local edit
        </Text>
      )}
    </HStack>
  );
}

function interfaceLabel(value: string) {
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
  const visible = PUBLIC_STATUSES.includes(status);
  return (
    <VStack gap={1}>
      <Token
        size="sm"
        color={visible ? "green" : "default"}
        label={interfaceLabel(status)}
        icon={
          <StatusDot
            variant={visible ? "success" : "neutral"}
            label={visible ? "Public" : "Not public"}
          />
        }
      />
      {changesPending && (
        <Text type="supporting" color="secondary">
          Changes pending
        </Text>
      )}
    </VStack>
  );
}

function RecordGlyph({ record }: { record: CatalogRecord }) {
  const [Icon, kind] =
    record.collection === "projects" ||
    record.href.startsWith("/content/projects/")
      ? ([BriefcaseIcon, "Project"] as const)
      : record.collection === "writing" ||
          record.href.startsWith("/content/writing/")
        ? ([ArticleIcon, "Article"] as const)
        : record.href.startsWith("/newsletter/")
          ? ([EnvelopeIcon, "Newsletter issue"] as const)
          : ([FileTextIcon, "Page"] as const);
  // A record with a summary shows the summary in place of its section label, so
  // this glyph is the only remaining kind signal. It carries the kind as text
  // rather than aria-hidden decoration, and as a tooltip, so the row is
  // readable without a legend and announces its kind to assistive technology.
  return (
    <span className="editorial-record-icon" title={kind}>
      <Icon weight="regular" size="var(--spacing-5)" aria-hidden="true" />
      <Text className="sr-only">{kind}</Text>
    </span>
  );
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
    <VStack gap={1} className="editorial-record-state">
      <RecordStatus status={record.status} />
      <Text type="supporting" color="secondary">
        {unavailable
          ? "Draft status unavailable"
          : (decision.detail ?? decision.label)}
      </Text>
    </VStack>
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
  const [state, setState] = useState<LibraryState>(() =>
    readLibraryState(initialSearch, selectedGroup),
  );
  const [currentUrl, setCurrentUrl] = useState(() =>
    libraryStateUrl(
      area === "newsletter" ? "/newsletter" : "/content",
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
      <EmptyState
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
  const recent =
    area === "content" && group.name === "pages" && !query && status === "all"
      ? recentlyUpdated(
          group.records.filter(
            (record) =>
              record.updated?.source === "private" ||
              record.updated?.source === "local",
          ),
        ).slice(0, 3)
      : [];
  const showSections =
    new Set(group.records.map((item) => item.section).filter(Boolean)).size > 1;
  const statuses = [...new Set(group.records.map((item) => item.status))];
  return (
    <VStack gap={5} className="editorial-library">
      {recent.length > 0 && (
        <section className="editorial-resume" aria-label="Recently edited">
          <HStack vAlign="center" className="editorial-resume-heading">
            <Text type="label">Recently edited</Text>
            <Text type="supporting" color="secondary">
              Pick up where you left off
            </Text>
          </HStack>
          <ul className="editorial-resume-list">
            {recent.map((record) => {
              const decision = contentDecision(record, !inventoryError);
              const href = recordLibraryHref(record.href, currentUrl);
              const section =
                record.section ??
                (record.href.startsWith("/content/projects/")
                  ? "Projects"
                  : record.href.startsWith("/content/writing/")
                    ? "Writing"
                    : "Pages");
              return (
                <li key={record.href} className="editorial-resume-row">
                  <div className="editorial-resume-meta">
                    <HStack
                      gap={2}
                      vAlign="center"
                      className="editorial-resume-kind"
                    >
                      <RecordGlyph record={record} />
                      <Text type="supporting" color="secondary">
                        {interfaceLabel(section)}
                      </Text>
                    </HStack>
                    <div className="editorial-resume-time">
                      <Updated updated={record.updated} />
                    </div>
                  </div>
                  <a
                    className="editorial-resume-link"
                    href={
                      decision.view ? decisionHref(href, decision.view) : href
                    }
                  >
                    <span className="editorial-resume-title">
                      {record.title}
                    </span>
                    <span className="editorial-resume-action">
                      {decision.action ?? "Open record"}
                      <ArrowRightIcon
                        weight="regular"
                        size={16}
                        aria-hidden="true"
                      />
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <HStack
        gap={3}
        wrap="wrap"
        vAlign="center"
        className="editorial-library-toolbar"
      >
        <TextInput
          className="editorial-library-search"
          label="Search records"
          isLabelHidden
          placeholder="Search records"
          startIcon="search"
          value={query}
          onChange={setQuery}
          hasClear
        />
        <HStack
          gap={2}
          hAlign="start"
          vAlign="center"
          className="editorial-filter-row editorial-library-filters"
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
                onChange={(checked) =>
                  setSections(checked ? sectionOptions : [])
                }
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
                    : "Title A–Z",
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
              <DropdownMenuRadioItem
                value="attention"
                label="Needs attention"
              />
              <DropdownMenuRadioItem value="updated" label="Last updated" />
              <DropdownMenuRadioItem value="title" label="Title" />
            </DropdownMenuRadioGroup>
          </DropdownMenu>
        </HStack>
      </HStack>
      {records.length ? (
        <>
          <Table
            className="editorial-record-table"
            data={records}
            idKey="href"
            density="compact"
            dividers="none"
            hasHover
            aria-label={`${interfaceLabel(group.name)} records`}
            columns={[
              {
                key: "title",
                header: "Title",
                width: proportional(1, { minWidth: 80 }),
                renderCell: (item) => (
                  <HStack
                    gap={3}
                    vAlign="center"
                    className="editorial-record-heading"
                  >
                    <RecordGlyph record={item} />
                    <VStack gap={1} className="editorial-record-content">
                      <Button
                        size="sm"
                        label={item.title}
                        href={recordLibraryHref(item.href, currentUrl)}
                        variant="ghost"
                        className="record-link"
                      />
                      {item.summary ? (
                        <Text
                          type="supporting"
                          color="secondary"
                          className="editorial-record-summary"
                        >
                          {item.summary}
                        </Text>
                      ) : showSections && item.section ? (
                        <Text
                          type="supporting"
                          color="secondary"
                          className="editorial-record-summary"
                        >
                          {interfaceLabel(item.section)}
                        </Text>
                      ) : null}
                      <HStack
                        className="editorial-mobile-status"
                        gap={3}
                        wrap="wrap"
                        vAlign="center"
                      >
                        <RecordState
                          record={item}
                          inventoryError={inventoryError}
                        />
                        <Updated updated={item.updated} column />
                      </HStack>
                    </VStack>
                  </HStack>
                ),
              },
              {
                key: "status",
                header: "State",
                width: pixel(144),
                renderCell: (item) => (
                  <RecordState record={item} inventoryError={inventoryError} />
                ),
              },
              {
                key: "updated",
                header: "Updated",
                width: pixel(112),
                renderCell: (item) => <Updated updated={item.updated} column />,
              },
              {
                key: "action",
                header: <Text className="sr-only">Action</Text>,
                width: pixel(52),
                align: "end",
                renderCell: (item) => (
                  <RecordAction
                    record={item}
                    returnTo={currentUrl}
                    inventoryError={inventoryError}
                  />
                ),
              },
            ]}
          />
        </>
      ) : (
        <EmptyState
          title={
            inventoryError
              ? "Records unavailable"
              : group.records.length === 0
                ? "No records yet"
                : "No matching records"
          }
          actions={
            inventoryError ? undefined : group.records.length === 0 ? (
              area === "content" &&
              ["writing", "pages"].includes(group.name) ? (
                <Button label="New article" href="/content/new" />
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
      <HStack
        gap={5}
        wrap="wrap"
        vAlign="center"
        className="admin-table-footer editorial-filter-row"
      >
        <Text
          type="supporting"
          color="secondary"
          aria-live="polite"
          role="status"
          aria-label={`${records.length} ${records.length === 1 ? "record" : "records"}`}
          className="editorial-record-count"
        >
          {records.length}
          <Text
            type="supporting"
            color="secondary"
            className="editorial-record-count-label"
          >
            {" "}
            {records.length === 1 ? "record" : "records"} in view
          </Text>
        </Text>
        {libraryFigures(records).map(([label, value]) => (
          <Text
            key={label}
            type="supporting"
            color="secondary"
            className="admin-table-figure"
          >
            <strong>{value}</strong> {label}
          </Text>
        ))}
      </HStack>
    </VStack>
  );
}
