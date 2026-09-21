import React, { useEffect, useId, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  ArrowBendUpLeftIcon,
  CalendarBlankIcon,
  FileTextIcon,
  FolderIcon,
  LockKeyIcon,
  MapPinIcon,
  TreeStructureIcon,
  UserIcon,
  type Icon,
} from "@phosphor-icons/react";
import { nextLifeOffset, type LifeResult } from "../../data/personal-context";
import {
  LifeReadSession,
  appendLifeBody,
  type LifeReader,
} from "../../lib/life-read-session";
import {
  DATA_KINDS,
  DATA_RECORDS_PATH,
  dataKind,
  dataRecordHref,
  dataRecordsHref,
  type DataKind,
} from "../../lib/data-routes";
import type { DataFixture } from "../../lib/data-fixture-reader";
import type { PrivateReaderSession } from "../../lib/private-reader-client";
import {
  DataTable,
  DetailPanel,
  FilterBar,
  InlineNotice,
  LoadingSkeleton,
  RelativeTime,
  RowTitle,
  SessionControl,
  StateBadge,
  StateNotice,
  TierSwatch,
  WorkspacePage,
  type Column,
} from "../workspace/Workspace";
import {
  SESSION_NOTE,
  SESSION_NOTICES,
  useDataSession,
  type DataSession,
} from "./useDataSession";

type Item = Record<string, unknown>;
const text = (value: unknown, fallback = "") =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;
const object = (value: unknown): Item =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Item)
    : {};

/** The reader's record kinds, as a glyph and a name. */
export function recordKindGlyph(kind: unknown): [Icon, string] {
  switch (kind) {
    case "person":
    case "contact":
      return [UserIcon, "Person"];
    case "project":
      return [FolderIcon, "Project"];
    case "place":
      return [MapPinIcon, "Place"];
    case "event":
      return [CalendarBlankIcon, "Event"];
    default:
      return [
        FileTextIcon,
        typeof kind === "string" && kind
          ? `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`
          : "Record",
      ];
  }
}

/** Record status as a chip: confirmed is positive, superseded is calm. */
function RecordBadge({ status }: { status: unknown }) {
  const value = text(status, "unknown");
  return (
    <StateBadge
      tone={
        value === "confirmed"
          ? "positive"
          : value === "superseded"
            ? "calm"
            : "neutral"
      }
      label={`${value.charAt(0).toUpperCase()}${value.slice(1)}`}
    />
  );
}

/** A failed read, in the kit's notice. The copy never repeats reader text. */
function ReadNotice({ result }: { result: LifeResult }) {
  if (result.state === "ready") return null;
  const copy = {
    disconnected: [
      "Not connected",
      "An authorized source connection is needed before records can be read here.",
    ],
    denied: [
      "Access to these records is unavailable",
      "This session does not permit the requested read.",
    ],
    unavailable: [
      "Records could not be loaded",
      "The source is unavailable. This does not mean your records are empty.",
    ],
    not_found: [
      "Record not found",
      "This record was not found in the authorized source.",
    ],
    invalid: [
      "The source response could not be used",
      "The read returned incomplete or unsupported information, so none of it is shown.",
    ],
  }[result.state];
  return (
    <StateNotice
      kind={result.state === "disconnected" ? "not-connected" : "error"}
      title={copy[0]}
      description={copy[1]}
    />
  );
}

function Pager({
  offsets,
  next,
  onPage,
}: {
  offsets: number[];
  next: number | null;
  onPage: (history: number[]) => void;
}) {
  if (offsets.length < 2 && next === null) return null;
  return (
    <HStack gap={2} hAlign="end" className="workspace-pager">
      <Button
        label="Previous"
        size="sm"
        variant="secondary"
        isDisabled={offsets.length < 2}
        onClick={() => onPage(offsets.slice(0, -1))}
      />
      <Button
        label="Next"
        size="sm"
        variant="secondary"
        isDisabled={next === null}
        onClick={() => next !== null && onPage([...offsets, next])}
      />
    </HStack>
  );
}

function pageAfter(result: LifeResult | null, offsets: number[]) {
  if (result?.state !== "ready") return null;
  try {
    return nextLifeOffset(result.data.next_offset, offsets.at(-1) ?? 0);
  } catch {
    return null;
  }
}

const itemsOf = (result: LifeResult | null): Item[] =>
  result?.state === "ready" && Array.isArray(result.data.items)
    ? result.data.items.map(object)
    : [];

/** An effective date at its own precision: a day, a month or a year, read in
 * UTC so a date never shifts across a timezone. */
export function effectiveDate(value: unknown, precision: unknown): string {
  if (typeof value !== "string" || !value) return "Unknown";
  const ms = Date.parse(value.length === 4 ? `${value}-01-01` : value);
  if (!Number.isFinite(ms)) return value;
  const options: Intl.DateTimeFormatOptions =
    precision === "year" || value.length === 4
      ? { year: "numeric" }
      : precision === "month" || value.length === 7
        ? { year: "numeric", month: "long" }
        : { year: "numeric", month: "short", day: "numeric" };
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: "UTC",
  }).format(ms);
}

function Evidence({ title, value }: { title: string; value: unknown }) {
  if (value == null) return null;
  return (
    <Collapsible trigger={<Text>{title}</Text>} defaultIsOpen={false}>
      <Text as="p" type="code" className="workspace-detail-body">
        {JSON.stringify(value, null, 2)}
      </Text>
    </Collapsible>
  );
}

/** One record: fields, body with paging, preserved revisions and evidence. */
export function RecordDetail({
  record,
  busy,
  error,
  onMore,
  back,
  panelRef,
  id,
}: {
  record: Item | null;
  busy: boolean;
  error: string | null;
  onMore: () => void;
  back: React.ReactNode;
  panelRef?: React.Ref<HTMLElement>;
  id?: string;
}) {
  if (!record)
    return (
      <DetailPanel title="Record" back={back} panelRef={panelRef} id={id}>
        {error ? (
          <Text role="alert">{error}</Text>
        ) : (
          busy && (
            <LoadingSkeleton label="record details" rows={3} columns={2} />
          )
        )}
      </DetailPanel>
    );
  const [, kindName] = recordKindGlyph(record.kind);
  const revisions = Array.isArray(record.revisions)
    ? record.revisions
        .map(object)
        .filter((item) => typeof item.revision_id === "string")
    : [];
  const provenance = object(record.provenance);
  return (
    <DetailPanel
      id={id}
      panelRef={panelRef}
      title={text(record.title, "Untitled record")}
      badge={
        <HStack gap={2} vAlign="center">
          <RecordBadge status={record.status} />
          <TierSwatch tier={text(record.tier) || null} />
        </HStack>
      }
      back={back}
      fields={[
        ["Kind", kindName],
        ["Observed", <RelativeTime key="o" value={text(record.observed_at)} />],
        ["Effective", effectiveDate(record.occurred_at, record.date_precision)],
        ["Source", text(record.source_id, "Not reported")],
        ["Source reference", text(provenance.source_uri, "Not reported")],
      ]}
    >
      {error && <Text role="alert">{error}</Text>}
      <Text as="p" className="workspace-detail-body">
        {text(record.body, "Metadata only")}
      </Text>
      {record.next_body_offset != null && (
        <HStack>
          <Button
            label="Read more"
            size="sm"
            variant="secondary"
            onClick={onMore}
            isLoading={busy}
          />
        </HStack>
      )}
      {revisions.length > 0 && (
        <VStack gap={3} as="section" aria-label="Revision history">
          <Text type="label">History</Text>
          <DataTable
            rows={revisions}
            rowKey="revision_id"
            label="Preserved revisions, newest first"
            noun={["revision", "revisions"]}
            columns={[
              {
                key: "revision",
                header: "Revision",
                render: (item) => (
                  <RowTitle
                    icon={FileTextIcon}
                    kind="Revision"
                    title={`Source version ${text(item.source_version, "unknown")}${item.revision_id === record.revision_id ? ", current" : ""}`}
                    secondary={text(item.revision_id)}
                  />
                ),
              },
              {
                key: "observed",
                header: "Observed",
                width: 112,
                render: (item) => (
                  <RelativeTime value={text(item.observed_at)} />
                ),
              },
            ]}
          />
          {typeof record.history_limit === "number" &&
            revisions.length >= record.history_limit && (
              <Text type="supporting" color="secondary">
                Showing the latest {record.history_limit} revisions. Older
                revisions are preserved but not returned.
              </Text>
            )}
          {typeof record.history_limit === "number" &&
            Array.isArray(record.origins) &&
            record.origins.length >= record.history_limit && (
              <Text type="supporting" color="secondary">
                Showing the latest {record.history_limit} origins.
              </Text>
            )}
        </VStack>
      )}
      <Evidence title="Assertion and corrections" value={record.assertion} />
      <Evidence title="Capture coverage" value={record.metadata} />
    </DetailPanel>
  );
}

function recordColumns(
  onSelect: (id: string, trigger: HTMLElement) => void,
  selectedId: string | null,
  detailId: string,
  kind: DataKind,
): Column<Item>[] {
  return [
    {
      key: "record",
      header: "Record",
      render: (item) => {
        const [glyph, name] = recordKindGlyph(item.kind);
        const id = typeof item.record_id === "string" ? item.record_id : null;
        return (
          <RowTitle
            icon={glyph}
            kind={name}
            title={text(item.title, "Untitled record")}
            href={id ? dataRecordHref(id, kind) : undefined}
            onSelect={id ? (trigger) => onSelect(id, trigger) : undefined}
            isPressed={selectedId === id}
            controls={detailId}
            secondary={text(item.search_excerpt) || text(item.source_id)}
            mobile={
              <>
                <RecordBadge status={item.status} />
                <TierSwatch tier={text(item.tier) || null} />
              </>
            }
          />
        );
      },
    },
    {
      key: "kind",
      header: "Kind",
      width: 112,
      hideBelow: 1024,
      render: (item) => (
        <Text color="secondary">{recordKindGlyph(item.kind)[1]}</Text>
      ),
    },
    {
      key: "state",
      header: "State",
      width: 132,
      hideBelow: 1280,
      render: (item) => <RecordBadge status={item.status} />,
    },
    {
      key: "tier",
      header: <Text className="sr-only">Tier</Text>,
      width: 44,
      render: (item) => <TierSwatch tier={text(item.tier) || null} />,
    },
    {
      key: "observed",
      header: "Observed",
      width: 112,
      render: (item) => <RelativeTime value={text(item.observed_at)} />,
    },
  ];
}

/** `/data/records[/<id>]` as the island reads it. */
function readLocation(): { id: string | null; kind: DataKind } {
  const url = new URL(window.location.href);
  const match = /^\/data\/records\/([^/]+)$/.exec(url.pathname);
  return {
    id: match ? decodeURIComponent(match[1]!) : null,
    kind: dataKind(url.searchParams.get("kind")),
  };
}

/**
 * Records: one search with a kind filter. An empty query lists the most
 * recent records. Opening a record moves to /data/records/<id> in this page,
 * so the private session carries over; the back button and the Back control
 * return to the list.
 */
function RecordsExplorer({
  reader,
  initialId,
  initialKind,
}: {
  reader: LifeReader;
  initialId: string | null;
  initialKind: DataKind;
}) {
  const detailId = useId();
  const [kind, setKind] = useState<DataKind>(initialKind);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [offsets, setOffsets] = useState([0]);
  const [result, setResult] = useState<LifeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [record, setRecord] = useState<Item | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const list = useRef(new LifeReadSession());
  const detail = useRef(new LifeReadSession());
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLElement | null>(null);

  async function search(q: string, nextKind: DataKind, history: number[]) {
    setBusy(true);
    const next = await list.current.run(reader, {
      method: "search",
      q,
      offset: history.at(-1) ?? 0,
      ...(DATA_KINDS[nextKind].reader
        ? { kind: DATA_KINDS[nextKind].reader }
        : {}),
    });
    if (!next) return;
    setBusy(false);
    setResult(next);
    if (next.state === "ready") {
      setSubmitted(q);
      setOffsets(history);
    }
  }
  async function load(id: string) {
    setRecord(null);
    setDetailBusy(true);
    setDetailError(null);
    const next = await detail.current.run(reader, { method: "get", id });
    if (!next) return;
    setDetailBusy(false);
    if (next.state === "ready") setRecord(next.data);
    else
      setDetailError(
        next.state === "not_found"
          ? "This record was not found in the authorized source."
          : "This record could not be read. Try opening it again.",
      );
  }
  useEffect(() => {
    void search("", initialKind, [0]);
    if (initialId) void load(initialId);
    const sessions = [list, detail];
    const restore = () => {
      const here = readLocation();
      setSelectedId(here.id);
      if (here.id) void load(here.id);
      else {
        detail.current.invalidate();
        setRecord(null);
      }
    };
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      sessions.forEach((session) => session.current.invalidate());
    };
  }, [reader]);
  useEffect(() => {
    if (selectedId) panel.current?.focus({ preventScroll: true });
  }, [selectedId]);

  const open = (id: string, button: HTMLElement) => {
    trigger.current = button;
    window.history.pushState(null, "", dataRecordHref(id, kind));
    setSelectedId(id);
    void load(id);
  };
  const close = () => {
    detail.current.invalidate();
    window.history.pushState(null, "", dataRecordsHref(kind));
    setSelectedId(null);
    setRecord(null);
    setDetailError(null);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const changeKind = (value: string) => {
    const next = dataKind(value);
    setKind(next);
    window.history.replaceState(
      null,
      "",
      selectedId ? dataRecordHref(selectedId, next) : dataRecordsHref(next),
    );
    void search(submitted, next, [0]);
  };
  async function more() {
    if (!record || typeof record.next_body_offset !== "number") return;
    const current = record;
    setDetailBusy(true);
    const next = await detail.current.run(reader, {
      method: "get",
      id: String(record.record_id),
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
        error instanceof Error ? error.message : "Reload this record.",
      );
    }
  }

  const items = itemsOf(result);
  const total =
    result?.state === "ready" && typeof result.data.total === "number"
      ? result.data.total
      : null;
  return (
    <div
      className="workspace-split"
      data-detail-open={selectedId ? "true" : "false"}
    >
      <VStack gap={4} className="workspace-split-list">
        <FilterBar
          search={{
            label: "Search records",
            value: query,
            onChange: (value) => setQuery(value.slice(0, 2048)),
            onSubmit: () => void search(query, kind, [0]),
            isBusy: busy,
          }}
        >
          <DropdownMenu
            button={{
              label: kind === "all" ? "Kind" : DATA_KINDS[kind].label,
              tooltip: `Kind: ${DATA_KINDS[kind].label}`,
              size: "sm",
              variant: "secondary",
            }}
            menuWidth="max-content"
          >
            <DropdownMenuRadioGroup
              label="Record kind"
              value={kind}
              onChange={changeKind}
            >
              {(Object.keys(DATA_KINDS) as DataKind[]).map((value) => (
                <DropdownMenuRadioItem
                  key={value}
                  value={value}
                  label={DATA_KINDS[value].label}
                />
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenu>
        </FilterBar>
        <Text type="supporting" color="secondary">
          {submitted ? "Best matches first" : "Most recent first"}
          {total !== null && `, ${total} in all`}
        </Text>
        {!result ? (
          <LoadingSkeleton label="records" columns={4} />
        ) : result.state !== "ready" ? (
          <ReadNotice result={result} />
        ) : items.length ? (
          <VStack gap={3} aria-busy={busy}>
            <DataTable
              rows={items}
              rowKey="record_id"
              columns={recordColumns(open, selectedId, detailId, kind)}
              label={submitted ? "Search results" : "Recent records"}
              noun={["record", "records"]}
            />
            <Pager
              offsets={offsets}
              next={pageAfter(result, offsets)}
              onPage={(history) => void search(submitted, kind, history)}
            />
          </VStack>
        ) : (
          <StateNotice
            kind="empty"
            title="No matching records"
            description="Try a different search or another kind."
            action={
              submitted || kind !== "all" ? (
                <Button
                  label="Clear search"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    changeKind("all");
                    void search("", "all", [0]);
                  }}
                />
              ) : undefined
            }
          />
        )}
      </VStack>
      {selectedId && (
        <RecordDetail
          id={detailId}
          panelRef={panel}
          record={record}
          busy={detailBusy}
          error={detailError}
          onMore={() => void more()}
          back={
            <HStack>
              <Button
                label="Back to records"
                size="sm"
                variant="ghost"
                icon={
                  <ArrowBendUpLeftIcon weight="regular" aria-hidden="true" />
                }
                onClick={close}
              />
            </HStack>
          }
        />
      )}
    </div>
  );
}

function SourcesExplorer({ reader }: { reader: LifeReader }) {
  const [offsets, setOffsets] = useState([0]);
  const [result, setResult] = useState<LifeResult | null>(null);
  const session = useRef(new LifeReadSession());
  async function read(history: number[]) {
    const next = await session.current.run(reader, {
      method: "sources",
      offset: history.at(-1) ?? 0,
    });
    if (!next) return;
    setResult(next);
    if (next.state === "ready") setOffsets(history);
  }
  useEffect(() => {
    void read([0]);
    const current = session.current;
    return () => current.invalidate();
  }, [reader]);
  const items = itemsOf(result);
  if (!result) return <LoadingSkeleton label="sources" columns={3} />;
  if (result.state !== "ready") return <ReadNotice result={result} />;
  if (!items.length)
    return (
      <StateNotice
        kind="empty"
        icon={TreeStructureIcon}
        title="No sources yet"
        description="The reader returned no permitted sources."
      />
    );
  return (
    <VStack gap={3}>
      <DataTable
        rows={items}
        rowKey="source_id"
        label="Sources"
        noun={["source", "sources"]}
        figures={[
          [
            "records",
            items.reduce(
              (sum, item) =>
                sum +
                (typeof item.record_count === "number" ? item.record_count : 0),
              0,
            ),
          ],
        ]}
        columns={[
          {
            key: "source",
            header: "Source",
            render: (item) => (
              <RowTitle
                icon={TreeStructureIcon}
                kind="Source"
                title={text(item.source_id, "Unnamed source")}
                secondary={`${text(item.record_count, "0")} records, ${text(item.revision_count, "0")} revisions`}
                mobile={<RelativeTime value={text(item.last_observed_at)} />}
              />
            ),
          },
          {
            key: "first",
            header: "First seen",
            width: 128,
            hideBelow: 1024,
            render: (item) => (
              <RelativeTime
                value={text(item.first_observed_at)}
                format="date"
              />
            ),
          },
          {
            key: "last",
            header: "Last seen",
            width: 112,
            render: (item) => (
              <RelativeTime value={text(item.last_observed_at)} />
            ),
          },
        ]}
      />
      <Pager
        offsets={offsets}
        next={pageAfter(result, offsets)}
        onPage={read}
      />
    </VStack>
  );
}

/** The closed, cleared and switched-off states, in the kit's notices. */
export function SessionNotice({ session }: { session: DataSession }) {
  if (session.status === "off")
    return (
      <StateNotice
        kind="not-connected"
        title="Not connected"
        description="The private reader is switched off for this admin. Records stay in PersonalContext on ap-mini."
      />
    );
  if (session.status === "ready") return null;
  const cleared = session.reason ? SESSION_NOTICES[session.reason] : null;
  return (
    <StateNotice
      kind="not-connected"
      icon={LockKeyIcon}
      title={cleared?.title ?? "Private session closed"}
      description={
        cleared?.description ??
        "Records are read from ap-mini with a credential that lasts at most a minute and renews while this page is open. Nothing is stored in this browser."
      }
    />
  );
}

export function DataSessionControl({ session }: { session: DataSession }) {
  if (session.status === "off") return null;
  return (
    <SessionControl
      active={session.status === "ready"}
      opening={session.opening}
      onOpen={session.open}
      onEnd={session.end}
      note={session.status === "ready" ? undefined : SESSION_NOTE}
    />
  );
}

/**
 * The Data workspace on the private reader. Private state lives in this
 * component's memory only and is dropped on logout, page hide, denial or
 * credential expiry. Each new session remounts the views, so nothing from
 * an earlier session carries over.
 */
export function DataWorkspace({
  view,
  enabled,
  recordId = null,
  kind = "all",
  fixture,
  session: injected,
  fetch: fetcher,
}: {
  view: "records" | "sources";
  enabled: boolean;
  recordId?: string | null;
  kind?: DataKind;
  fixture?: DataFixture;
  session?: PrivateReaderSession;
  fetch?: typeof fetch;
}) {
  const session = useDataSession({
    enabled,
    fixture,
    session: injected,
    fetch: fetcher,
  });
  const ready = session.status === "ready" && session.reader;
  return (
    <WorkspacePage
      title={view === "records" ? "Records" : "Sources"}
      meta={
        session.fixture
          ? "Synthetic fixture, not your records"
          : ready
            ? "Private session open, read only"
            : undefined
      }
      actions={<DataSessionControl session={session} />}
    >
      {session.status === "cleared" && session.reason === "expired" && (
        <InlineNotice
          tone="info"
          icon={LockKeyIcon}
          title={SESSION_NOTICES.expired.title}
          description={SESSION_NOTICES.expired.description}
        />
      )}
      {ready ? (
        view === "records" ? (
          <RecordsExplorer
            key={session.generation}
            reader={session.reader!}
            initialId={recordId}
            initialKind={kind}
          />
        ) : (
          <SourcesExplorer key={session.generation} reader={session.reader!} />
        )
      ) : (
        <SessionNotice session={session} />
      )}
    </WorkspacePage>
  );
}

export { DATA_RECORDS_PATH };
