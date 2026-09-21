import React, { useEffect, useRef, useState } from "react";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { HStack } from "@astryxdesign/core/HStack";
import { Banner } from "@astryxdesign/core/Banner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Table, pixel, proportional } from "@astryxdesign/core/Table";
import {
  ArrowRightIcon,
  UsersIcon,
  FolderIcon,
  MapPinIcon,
  ClockIcon,
  LinkIcon,
  LinkBreakIcon,
  ShieldWarningIcon,
  WarningCircleIcon,
  FileTextIcon,
  HeartIcon,
  PaletteIcon,
} from "@phosphor-icons/react";
import "./life-workspace.css";
import { VStack } from "@astryxdesign/core/VStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { List, ListItem } from "@astryxdesign/core/List";
import { Token } from "@astryxdesign/core/Token";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { LifeActivityView } from "./LifeActivityView";
import {
  nextLifeOffset,
  type LifeRead,
  type LifeResult,
} from "../../data/personal-context";
import { AdminSkeleton, RecoveryBanner } from "../astryx/AdminFeedback";
import {
  LifeReadSession,
  appendLifeBody,
  type LifeReader,
} from "../../lib/life-read-session";

import {
  lifeSections,
  lifeSectionRead,
  lifeSectionSupportsPagination,
  type LifeSection,
} from "../../lib/life-sections";
export { lifeSections, type LifeSection };
const scalar = (value: unknown, fallback = "Not reported") =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
function Metadata({ fields }: { fields: [string, unknown][] }) {
  return (
    <MetadataList
      className="life-metadata"
      columns="multi"
      label={{ position: "top" }}
    >
      {fields.map(([label, value]) => (
        <MetadataListItem key={label} label={label}>
          <Text wordBreak="break-word">{scalar(value)}</Text>
        </MetadataListItem>
      ))}
    </MetadataList>
  );
}
function Evidence({ title, value }: { title: string; value: unknown }) {
  if (value == null) return null;
  return (
    <Collapsible trigger={<Text>{title}</Text>} defaultIsOpen={false}>
      <Text
        as="p"
        type="code"
        style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
      >
        {JSON.stringify(value, null, 2)}
      </Text>
    </Collapsible>
  );
}
export function LifeRecord({ record }: { record: Record<string, unknown> }) {
  return (
    <VStack gap={5} className="life-record-detail">
      <HStack
        gap={3}
        vAlign="center"
        wrap="wrap"
        className="life-record-detail-heading"
      >
        <Heading level={2}>{scalar(record.title, "Untitled record")}</Heading>
        <Token size="sm" label={scalar(record.status, "Unconfirmed")} />
      </HStack>
      <Text as="p" className="life-record-body">
        {scalar(record.body, "Metadata only")}
      </Text>
      <Metadata
        fields={[
          ["Effective date", scalar(record.occurred_at, "Unknown")],
          ["Date precision", record.date_precision],
          ["Observed", record.observed_at],
          ["Temporal state", record.temporal_status],
          [
            "Confirmed current as of",
            scalar(record.current_as_of, "Not witnessed"),
          ],
          ["Witness state", record.current_as_of_status],
          ["Source", record.source_id],
          ["Source reference", object(record.provenance).source_uri],
          ["Revision", record.revision_id],
          ["Classification", record.tier],
        ]}
      />
      <Evidence title="Assertion and corrections" value={record.assertion} />
      <Evidence title="Preserved revisions" value={record.revisions} />
      <Evidence title="Capture coverage" value={record.metadata} />
      {Array.isArray(record.omitted_fields) && (
        <Text>
          Omitted fields:{" "}
          {record.omitted_fields.map((value) => scalar(value)).join(", ")}
        </Text>
      )}
    </VStack>
  );
}
export function LifeReadView({
  result,
  section,
  onSelect,
  isStale = false,
}: {
  result: LifeResult;
  section: LifeSection;
  onSelect?: (id: string) => void;
  /**
   * The latest refresh failed and this ready result is retained. Only the
   * record and source library marks it, on its count and a "Not current"
   * token; overview and preview render unchanged.
   */
  isStale?: boolean;
}) {
  if (result.state !== "ready") {
    const presentation = {
      // Severity is part of the signal, not just the wording. A configuration
      // state reads as information; a refused or failed read is a warning, so
      // it does not look like an ordinary empty result.
      disconnected: {
        title: "Life is not connected yet",
        description:
          "Records remain in PersonalContext. An authorized source connection is needed before they can be read here.",
        Icon: LinkBreakIcon,
        status: "info" as const,
      },
      denied: {
        title: "Access to these records is unavailable",
        description:
          "This connection does not permit the requested read. Return when authorized access is available.",
        Icon: ShieldWarningIcon,
        status: "warning" as const,
      },
      unavailable: {
        title: "Records could not be loaded",
        description:
          "The source is unavailable. This does not mean that your records are empty. Try again when the source is available.",
        Icon: WarningCircleIcon,
        status: "warning" as const,
      },
      invalid: {
        title: "The source response could not be used",
        description:
          "The read returned incomplete or unsupported information. No records from this response are shown.",
        Icon: WarningCircleIcon,
        status: "warning" as const,
      },
    }[result.state];
    return (
      <Banner
        status={presentation.status}
        container="section"
        title={presentation.title}
        description={presentation.description}
        icon={<presentation.Icon weight="regular" />}
      />
    );
  }
  const data = result.data;
  const items = Array.isArray(data.items) ? data.items.map(object) : [];
  if (section === "preview")
    return (
      <VStack gap={4}>
        <Metadata
          fields={[
            ["Access scope", result.scope],
            ["Tokens", `${scalar(data.token_count)} / ${scalar(data.budget)}`],
            ["Measurement", data.token_measurement],
          ]}
        />
        <Heading level={2}>Exact context</Heading>
        <Text
          as="p"
          type="code"
          style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
        >
          {scalar(data.context_text, "")}
        </Text>
        <Evidence title="Selected sources" value={data.selected} />
        <Evidence title="Omissions" value={data.omitted} />
      </VStack>
    );
  if (section === "overview")
    return (
      <Metadata
        fields={[
          ["Ingestion", object(data.ingestion).state],
          ["Automatic capture", object(data.ingestion).automatic_sources],
          ["Last change", data.last_change_at],
          [
            "Wiki",
            object(data.wiki).available !== true
              ? "Unavailable"
              : object(data.wiki).stale === true
                ? "Stale"
                : "Available",
          ],
        ]}
      />
    );
  const sources = section === "sources";
  const Glyph = sources
    ? LinkIcon
    : section === "people"
      ? UsersIcon
      : section === "projects"
        ? FolderIcon
        : section === "places"
          ? MapPinIcon
          : section === "timeline"
            ? ClockIcon
            : FileTextIcon;
  const evidence = (item: Record<string, unknown>) =>
    sources ? (
      <Text type="supporting" color="secondary" wordBreak="break-word">
        Coverage: {scalar(item.coverage)}
      </Text>
    ) : (
      <VStack gap={1}>
        <Text type="supporting" color="secondary" wordBreak="break-word">
          Effective: {scalar(item.occurred_at, "Date unknown")}
        </Text>
        <Text type="supporting" color="secondary" wordBreak="break-word">
          Observed: {scalar(item.observed_at, "Date unknown")}
        </Text>
      </VStack>
    );
  const noun = sources ? "source" : "record";
  const count = `${items.length} ${items.length === 1 ? noun : `${noun}s`} shown${
    typeof data.total === "number" ? ` of ${data.total}` : ""
  }`;
  return (
    <VStack gap={3} className="life-record-library">
      <HStack gap={2} vAlign="center" wrap="wrap">
        {/* A failed refresh keeps these rows; the status says so once instead
            of presenting the retained figure as current. */}
        <Text type="supporting" color="secondary" role="status">
          {isStale ? `${count} from the last successful read` : count}
        </Text>
        {isStale && (
          <Token
            size="sm"
            label="Not current"
            icon={
              <StatusDot
                variant="warning"
                label="Not current"
                aria-hidden="true"
                isPulsing={false}
              />
            }
          />
        )}
      </HStack>
      {items.length > 0 ? (
        <Table
          className="life-record-table"
          data={items}
          density="compact"
          dividers="none"
          verticalAlign="middle"
          hasHover={Boolean(onSelect) && !sources}
          columns={[
            {
              key: "record",
              header: sources ? "Source" : "Record",
              width: proportional(1, { minWidth: 80 }),
              renderCell: (item) => {
                const title = scalar(
                  sources ? item.source_id : item.title,
                  "Untitled record",
                );
                const selectable =
                  !sources && typeof item.record_id === "string" && onSelect;
                return (
                  <HStack
                    gap={3}
                    vAlign="center"
                    className="life-record-heading"
                  >
                    <Glyph
                      weight="regular"
                      size="var(--spacing-5)"
                      className="life-row-icon"
                      aria-hidden="true"
                    />
                    <VStack gap={1} className="life-record-label">
                      {selectable ? (
                        <Button
                          label={title}
                          variant="ghost"
                          size="sm"
                          className="life-record-select"
                          onClick={() => onSelect(item.record_id as string)}
                        />
                      ) : (
                        <Text weight="medium" wordBreak="break-word">
                          {title}
                        </Text>
                      )}
                      {!sources && (
                        <Text
                          type="supporting"
                          color="secondary"
                          wordBreak="break-word"
                        >
                          Source: {scalar(item.source_id)}
                        </Text>
                      )}
                      <VStack gap={2} className="life-record-mobile-evidence">
                        {evidence(item)}
                        <Token
                          label={scalar(item.status, "Unknown")}
                          size="sm"
                        />
                      </VStack>
                    </VStack>
                  </HStack>
                );
              },
            },
            {
              key: "evidence",
              header: sources ? "Coverage" : "Dates",
              width: pixel(192),
              renderCell: evidence,
            },
            {
              key: "state",
              header: "State",
              width: pixel(120),
              renderCell: (item) => (
                <Token label={scalar(item.status, "Unknown")} size="sm" />
              ),
            },
          ]}
        />
      ) : (
        <EmptyState
          headingLevel={2}
          isCompact
          title="No permitted records match this request."
          description={
            sources
              ? "The source returned no permitted sources for this read."
              : "Try a different search or return to another Life view."
          }
          icon={<Glyph weight="regular" />}
        />
      )}
    </VStack>
  );
}
/** Reader is injected by a separately approved capability, never derived from URL input. */
export function LifeExplorer({
  section,
  initial,
  reader,
}: {
  section: LifeSection;
  initial: LifeResult;
  reader?: LifeReader;
}) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [result, setResult] = useState(initial);
  const [offsets, setOffsets] = useState([0]);
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  // setSubmitted runs only on ready, so the failed request is kept for retry.
  const failed = useRef<[string, number[]]>(["", [0]]);
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const listSession = useRef(new LifeReadSession());
  const detailSession = useRef(new LifeReadSession());
  useEffect(
    () => () => {
      listSession.current.invalidate();
      detailSession.current.invalidate();
    },
    [],
  );
  const closeRecord = () => {
    detailSession.current.invalidate();
    setRecord(null);
    setDetailBusy(false);
    setDetailError(null);
  };
  async function load(q: string, history: number[]) {
    if (!reader) return;
    let request: LifeRead;
    try {
      request = lifeSectionRead(section, {
        query: q,
        offset: history.at(-1) ?? 0,
      });
    } catch {
      failed.current = [q, [0]];
      setListError("This page could not be continued. Try the search again.");
      return;
    }
    closeRecord();
    setBusy(true);
    setListError(null);
    const next = await listSession.current.run(reader, request);
    if (next) {
      setBusy(false);
      if (next.state === "ready") {
        setResult(next);
        setSubmitted(q);
        setOffsets(history);
        setStale(false);
      } else if (next.state === "denied" || next.state === "disconnected") {
        setResult(next);
        setStale(false);
      } else {
        failed.current = [q, history];
        setStale(true);
        setListError("Records could not be refreshed. Try again.");
      }
    }
  }
  async function select(id: string) {
    if (!reader) return;
    setRecord(null);
    setDetailBusy(true);
    setDetailError(null);
    const next = await detailSession.current.run(reader, { method: "get", id });
    if (next) {
      setDetailBusy(false);
      if (next.state === "ready") setRecord(next.data);
      else
        setDetailError(
          "This record could not be read. Try selecting it again.",
        );
    }
  }
  async function moreBody() {
    if (
      !reader ||
      !record ||
      typeof record.record_id !== "string" ||
      typeof record.next_body_offset !== "number" ||
      detailBusy
    )
      return;
    const current = record;
    setDetailBusy(true);
    setDetailError(null);
    const next = await detailSession.current.run(reader, {
      method: "get",
      id: record.record_id,
      body_offset: record.next_body_offset,
    });
    if (!next) return;
    setDetailBusy(false);
    if (next.state !== "ready") {
      setDetailError("The next section could not be read. Try again.");
      return;
    }
    try {
      setRecord(appendLifeBody(current, next.data));
    } catch (error) {
      setDetailError(
        error instanceof Error
          ? error.message
          : "Reload this record before continuing.",
      );
    }
  }
  const searchable = !["overview", "sources", "timeline"].includes(section);
  const paginated = lifeSectionSupportsPagination(section);
  let nextOffset: number | null = null;
  let pagingError: string | null = null;
  if (result.state === "ready" && paginated) {
    try {
      nextOffset = nextLifeOffset(result.data.next_offset, offsets.at(-1) ?? 0);
    } catch {
      pagingError = "This page could not be continued. Try the search again.";
    }
  }
  return (
    <VStack gap={4}>
      {searchable && reader && (
        <HStack
          as="form"
          gap={2}
          wrap="wrap"
          vAlign="end"
          className="life-search-toolbar"
          onSubmit={(event: React.FormEvent) => {
            event.preventDefault();
            void load(query, [0]);
          }}
        >
          <TextInput
            label={section === "preview" ? "Question" : "Search records"}
            value={query}
            onChange={(value) => setQuery(value.slice(0, 2048))}
          />
          <Button
            type="submit"
            label={section === "preview" ? "Preview context" : "Search"}
            isLoading={busy}
          />
        </HStack>
      )}
      {!searchable && reader && (
        <Button
          label="Refresh"
          clickAction={() => load(submitted, offsets)}
          isLoading={busy}
        />
      )}
      {(listError || pagingError) && (
        <RecoveryBanner
          title={listError ?? pagingError ?? "Read unavailable"}
          // A paging error comes from the ready read on screen, so its retry
          // restarts that submitted search, never unsubmitted field text.
          onRetry={() =>
            listError ? load(...failed.current) : load(submitted, [0])
          }
        />
      )}
      {busy && result.state !== "ready" ? (
        <AdminSkeleton kind="records" />
      ) : (
        <VStack aria-busy={busy}>
          <LifeReadView
            result={result}
            section={section}
            onSelect={reader ? (id) => void select(id) : undefined}
            isStale={stale}
          />
        </VStack>
      )}
      {reader &&
        paginated &&
        !busy &&
        result.state === "ready" &&
        (offsets.length > 1 || nextOffset !== null) && (
          <Toolbar
            label="Record pages"
            startContent={
              <Button
                label="Previous"
                isDisabled={offsets.length < 2}
                clickAction={() => load(submitted, offsets.slice(0, -1))}
              />
            }
            endContent={
              <Button
                label="Next"
                isDisabled={nextOffset === null}
                clickAction={() =>
                  nextOffset === null
                    ? Promise.resolve()
                    : load(submitted, [...offsets, nextOffset])
                }
              />
            }
          />
        )}
      {(detailBusy || record || detailError) && (
        <VStack
          gap={4}
          as="section"
          aria-label="Record details"
          className="life-details-region"
        >
          <Button label="Close details" onClick={closeRecord} variant="ghost" />
          {detailError && <Text role="alert">{detailError}</Text>}
          {record && <LifeRecord record={record} />}
          {detailBusy && !record && <AdminSkeleton kind="record" />}
          {record?.next_body_offset != null && (
            <Button
              label="Read more"
              clickAction={moreBody}
              isLoading={detailBusy}
            />
          )}
        </VStack>
      )}
    </VStack>
  );
}
/** Broad record frame; prose stays capped within the detail. Shared navigation remains Website-owned. */
export function LifeWorkspace({
  section = "overview",
  result,
  reader,
}: {
  section?: LifeSection;
  result: LifeResult;
  reader?: LifeReader;
}) {
  return (
    <Layout
      height="auto"
      className="life-workspace"
      padding={0}
      header={
        <LayoutHeader className="life-page-header">
          <HStack
            gap={3}
            vAlign="center"
            wrap="wrap"
            className="life-page-title"
          >
            <Heading level={1}>{lifeSections[section]}</Heading>
            <Token size="sm" label="Read only" />
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent className="life-page-content">
          <VStack gap={6}>
            {section === "preview" && (
              <Metadata
                fields={[
                  ["Strategy", "Lookup only"],
                  ["Token budget", "3,000"],
                  ["Recent window", "Seven days"],
                ]}
              />
            )}
            <LifeExplorer
              key={section}
              section={section}
              initial={result}
              reader={reader}
            />
            {section === "overview" && reader && (
              <LifeActivityView reader={reader} />
            )}
            {section === "overview" && (
              <VStack gap={5}>
                <List
                  className="life-view-list"
                  density="compact"
                  header={<Heading level={2}>Your views</Heading>}
                >
                  {[
                    {
                      label: "People",
                      href: "/life/people",
                      description: "Relationships and dated references",
                      Icon: UsersIcon,
                    },
                    {
                      label: "Projects",
                      href: "/life/projects",
                      description: "Project records and supporting evidence",
                      Icon: FolderIcon,
                    },
                    {
                      label: "Places",
                      href: "/life/places",
                      description: "Locations with source context",
                      Icon: MapPinIcon,
                    },
                    {
                      label: "Timeline",
                      href: "/life/timeline",
                      description: "Events and their original dates",
                      Icon: ClockIcon,
                    },
                    {
                      label: "Sources",
                      href: "/life/sources",
                      description: "Source boundaries and recorded coverage",
                      Icon: LinkIcon,
                    },
                  ].map(({ label, href, description, Icon }) => (
                    <ListItem
                      key={href}
                      label={label}
                      href={href}
                      description={
                        <Text type="supporting" color="secondary">
                          {description}
                        </Text>
                      }
                      startContent={
                        <Icon
                          weight="regular"
                          size="var(--spacing-5)"
                          aria-hidden="true"
                        />
                      }
                      endContent={
                        <ArrowRightIcon
                          weight="regular"
                          size="var(--spacing-4)"
                          aria-hidden="true"
                        />
                      }
                    />
                  ))}
                </List>
                <List
                  className="life-view-list"
                  density="compact"
                  header={<Heading level={2}>Other views</Heading>}
                >
                  <ListItem
                    label="Knowledge"
                    href="/knowledge"
                    description={
                      <Text type="supporting" color="secondary">
                        Existing knowledge cards and source-backed locations
                      </Text>
                    }
                    startContent={
                      <FileTextIcon
                        weight="regular"
                        size="var(--spacing-5)"
                        aria-hidden="true"
                      />
                    }
                    endContent={
                      <ArrowRightIcon
                        weight="regular"
                        size="var(--spacing-4)"
                        aria-hidden="true"
                      />
                    }
                  />
                  <ListItem
                    label="Knowledge locations"
                    href="/knowledge/locations"
                    description={
                      <Text type="supporting" color="secondary">
                        Place records from the existing knowledge reader
                      </Text>
                    }
                    startContent={
                      <MapPinIcon
                        weight="regular"
                        size="var(--spacing-5)"
                        aria-hidden="true"
                      />
                    }
                    endContent={
                      <ArrowRightIcon
                        weight="regular"
                        size="var(--spacing-4)"
                        aria-hidden="true"
                      />
                    }
                  />
                  <ListItem
                    label="Health"
                    href="/life/health"
                    description={
                      <Text type="supporting" color="secondary">
                        Existing source summaries
                      </Text>
                    }
                    startContent={
                      <HeartIcon
                        weight="regular"
                        size="var(--spacing-5)"
                        aria-hidden="true"
                      />
                    }
                    endContent={
                      <ArrowRightIcon
                        weight="regular"
                        size="var(--spacing-4)"
                        aria-hidden="true"
                      />
                    }
                  />
                  <ListItem
                    label="Aesthetics"
                    href="/life/aesthetics"
                    description={
                      <Text type="supporting" color="secondary">
                        Style references are not connected yet
                      </Text>
                    }
                    startContent={
                      <PaletteIcon
                        weight="regular"
                        size="var(--spacing-5)"
                        aria-hidden="true"
                      />
                    }
                    endContent={
                      <ArrowRightIcon
                        weight="regular"
                        size="var(--spacing-4)"
                        aria-hidden="true"
                      />
                    }
                  />
                </List>
              </VStack>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
