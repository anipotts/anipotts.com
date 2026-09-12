import { contentDecision, decisionHref } from "../../lib/content-decision";
import React, { useEffect, useState } from "react";
import type { CatalogRecord, CatalogGroup } from "./EditorialApp";
import { Button } from "@astryxdesign/core/Button";
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
  if (!Number.isFinite(date.getTime())) return null;
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

export function RecordStatus({
  status,
  changesPending,
}: {
  status: string;
  changesPending?: boolean;
}) {
  const visible = ["published", "featured", "listed"].includes(status);
  return (
    <VStack gap={1}>
      <Token
        size="sm"
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

function DecisionCell({
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
      ? record.changedFields.length
        ? record.changedFields.slice(0, 2).join(" · ") +
          (record.changedFields.length > 2
            ? ` +${record.changedFields.length - 2}`
            : "")
        : "Source changes"
      : undefined;
  const detail = decision.detail ?? changed;
  return (
    <VStack gap={1} className="editorial-record-decision">
      {decision.action && decision.view ? (
        <Button
          size="sm"
          variant="ghost"
          className="record-decision-link"
          label={decision.action}
          href={decisionHref(
            recordLibraryHref(record.href, returnTo),
            decision.view,
          )}
        />
      ) : (
        <Text type="supporting" color="secondary">
          {decision.label}
        </Text>
      )}
      {detail && (
        <Text type="supporting" color="secondary">
          {detail}
        </Text>
      )}
    </VStack>
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
    <VStack gap={4}>
      {recent.length > 0 && (
        <VStack gap={2}>
          <Text type="label">Recently edited</Text>
          <HStack gap={2} className="editorial-resume-grid">
            {recent.map((record) => (
              <VStack
                key={record.href}
                gap={1}
                className="editorial-resume-item"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="record-link"
                  label={record.title}
                  href={recordLibraryHref(record.href, currentUrl)}
                />
                <Updated updated={record.updated} />
              </VStack>
            ))}
          </HStack>
        </VStack>
      )}
      <TextInput
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
        className="editorial-filter-row"
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
            <DropdownMenuRadioItem value="attention" label="Needs attention" />
            <DropdownMenuRadioItem value="updated" label="Last updated" />
            <DropdownMenuRadioItem value="title" label="Title" />
          </DropdownMenuRadioGroup>
        </DropdownMenu>
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
            {records.length === 1 ? "record" : "records"}
          </Text>
        </Text>
      </HStack>
      {records.length ? (
        <>
          <Table
            className="editorial-record-table"
            data={records}
            idKey="href"
            density="compact"
            hasHover
            aria-label={`${interfaceLabel(group.name)} records`}
            columns={[
              {
                key: "title",
                header: "Title",
                width: proportional(1, { minWidth: 80 }),
                renderCell: (item) => (
                  <VStack gap={1} className="editorial-record-content">
                    <HStack
                      gap={2}
                      vAlign="center"
                      className="editorial-record-heading"
                    >
                      <Button
                        size="sm"
                        label={item.title}
                        href={recordLibraryHref(item.href, currentUrl)}
                        variant="ghost"
                        className="record-link"
                      />
                      {showSections && item.section && (
                        <Text type="supporting" color="secondary">
                          {interfaceLabel(item.section)}
                        </Text>
                      )}
                    </HStack>
                    {item.summary && (
                      <Text
                        type="supporting"
                        color="secondary"
                        className="editorial-record-summary"
                      >
                        {item.summary}
                      </Text>
                    )}
                    <HStack
                      className="editorial-mobile-status"
                      gap={2}
                      wrap="wrap"
                    >
                      <DecisionCell
                        record={item}
                        returnTo={currentUrl}
                        inventoryError={inventoryError}
                      />
                      <Updated updated={item.updated} />
                    </HStack>
                  </VStack>
                ),
              },
              {
                key: "status",
                header: area === "content" ? "Next step" : "Status",
                width: pixel(160),
                renderCell: (item) => (
                  <DecisionCell
                    record={item}
                    returnTo={currentUrl}
                    inventoryError={inventoryError}
                  />
                ),
              },
              {
                key: "updated",
                header: "Last updated",
                width: pixel(112),
                renderCell: (item) => <Updated updated={item.updated} column />,
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
    </VStack>
  );
}
