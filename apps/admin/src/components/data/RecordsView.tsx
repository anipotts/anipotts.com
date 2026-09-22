import React, { useEffect, useId, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { Text } from "@astryxdesign/core/Text";
import {
  ToggleButton,
  ToggleButtonGroup,
} from "@astryxdesign/core/ToggleButton";
import { VStack } from "@astryxdesign/core/VStack";
import {
  ArrowBendUpLeftIcon,
  CalendarBlankIcon,
  CopyIcon,
  EyeIcon,
  XIcon,
} from "@phosphor-icons/react";
import { nextLifeOffset, type LifeResult } from "../../data/personal-context";
import {
  LifeReadSession,
  appendLifeBody,
  type LifeReader,
} from "../../lib/life-read-session";
import {
  DATA_KINDS,
  dataKind,
  dataRecordHref,
  dataRecordsHref,
  type DataKind,
  type RecordsRoute,
} from "../../lib/data-routes";
import { BrandTile } from "../BrandTile";
import {
  DataTable,
  FilterBar,
  InlineNotice,
  LoadingSkeleton,
  RelativeTime,
  RowTitle,
  StateBadge,
  StateNotice,
  TierMark,
  type Column,
} from "../workspace/Workspace";
import {
  effectiveDate,
  evidenceFields,
  kindGlyph,
  parseItems,
  parseRecord,
  sourceLabel,
  type DataRecord,
} from "./data-model";
import { ReadNotice, type DataNavigate } from "./DataNotices";
import { provideSearchEntries } from "../../lib/admin-search-index";

type Failure = Exclude<LifeResult, { state: "ready" }>;

/** A source's tile and short name, with its id as the tooltip. */
export function SourceName({
  id,
  text,
}: {
  id: string;
  /** Text in place of the name, such as a search excerpt. */
  text?: string | null;
}) {
  const source = sourceLabel(id);
  return (
    <span className="data-source" title={id}>
      <BrandTile id={source.tile.id} kind={source.tile.kind} size={20} />
      <span className="data-source-name">{text ?? source.name}</span>
    </span>
  );
}

/**
 * Record rows, for Records and the overview. Line 1 is the kind tile, the
 * title and the time; line 2 is the source (or the search excerpt), and at
 * compact a non-default state and the tier ahead of it.
 */
export function recordColumns({
  href,
  onSelect,
  selectedId = null,
  controls,
  hideSource = false,
}: {
  href: (record: DataRecord) => string;
  onSelect?: (record: DataRecord, trigger: HTMLElement) => void;
  selectedId?: string | null;
  controls?: string;
  /** Every row has the same source, so line 2 leaves it out. */
  hideSource?: boolean;
}): Column<DataRecord>[] {
  return [
    {
      key: "record",
      header: "Record",
      render: (record) => {
        const [glyph, kind] = kindGlyph(record.kind);
        const line =
          record.source && !hideSource ? (
            <SourceName id={record.source} text={record.excerpt} />
          ) : (
            record.excerpt
          );
        return (
          <RowTitle
            icon={glyph}
            kind={kind}
            title={record.title ?? "Untitled"}
            href={href(record)}
            onSelect={
              onSelect ? (trigger) => onSelect(record, trigger) : undefined
            }
            isPressed={onSelect ? selectedId === record.id : undefined}
            controls={controls}
            secondary={line || undefined}
            mobile={
              <>
                <StateBadge domain="record" state={record.status} />
                <TierMark tier={record.tier} />
              </>
            }
            time={record.observedAt}
          />
        );
      },
    },
    {
      key: "state",
      header: "State",
      width: 120,
      render: (record) => <StateBadge domain="record" state={record.status} />,
    },
    {
      key: "tier",
      header: <Text className="sr-only">Tier</Text>,
      width: 44,
      render: (record) => <TierMark tier={record.tier} />,
    },
    {
      key: "observed",
      header: "Observed",
      // Holds "Not recorded" with the cell inset.
      width: 120,
      render: (record) => <RelativeTime value={record.observedAt} />,
    },
  ];
}

const KIND_CHIPS = (Object.keys(DATA_KINDS) as DataKind[]).filter(
  (kind) => kind !== "all",
);

/** The search, then a scrolling row of kind chips and the source filter. */
export function RecordsToolbar({
  route,
  navigate,
  query = "",
  onSearch = () => {},
  onClear,
  busy = false,
  disabled = false,
}: {
  route: RecordsRoute;
  navigate: DataNavigate;
  query?: string;
  onSearch?: (query: string) => void;
  onClear?: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const filter = (next: { kind?: DataKind; source?: string | null }) => {
    const value = {
      kind: next.kind ?? route.kind,
      source: next.source === undefined ? route.source : next.source,
    };
    navigate(
      route.id ? dataRecordHref(route.id, value) : dataRecordsHref(value),
      { replace: true },
    );
  };
  const source = route.source ? sourceLabel(route.source) : null;
  return (
    <div className="data-toolbar">
      <FilterBar
        search={{
          label: "Search records",
          value: query,
          onChange: (value) => onSearch(value.slice(0, 2048)),
          onClear,
          isBusy: busy,
          isDisabled: disabled,
        }}
      />
      <div className="data-chips">
        {source && (
          <ToggleButton
            size="sm"
            isPressed
            isDisabled={disabled}
            label={`Source: ${source.name}`}
            tooltip="Clear source filter"
            icon={
              <BrandTile
                id={source.tile.id}
                kind={source.tile.kind}
                size={20}
              />
            }
            onPressedChange={() => filter({ source: null })}
          >
            <span className="data-chip-text">
              {source.name}
              <XIcon
                weight="bold"
                aria-hidden="true"
                className="data-chip-clear"
              />
            </span>
          </ToggleButton>
        )}
        <ToggleButtonGroup
          label="Record kind"
          size="sm"
          isDisabled={disabled}
          value={route.kind === "all" ? null : route.kind}
          onChange={(value) => filter({ kind: dataKind(value) })}
        >
          {KIND_CHIPS.map((kind) => {
            const [Glyph] = kindGlyph(DATA_KINDS[kind].reader);
            return (
              <ToggleButton
                key={kind}
                value={kind}
                label={DATA_KINDS[kind].label}
                icon={<Glyph weight="regular" aria-hidden="true" />}
              />
            );
          })}
        </ToggleButtonGroup>
      </div>
    </div>
  );
}

/** Fill a source-filtered page from at most this many reads. The reader
 * searches by kind, not by source, so the filter applies to what it returns. */
const SOURCE_PAGE_READS = 5;
const SOURCE_PAGE_FILL = 10;

type List = {
  items: DataRecord[];
  /** The reader's total for the search; unknown while a source filter
   * applies and more pages remain. */
  total: number | null;
  next: number | null;
  failure: Failure | null;
};

const LOCAL_TIME = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** A time for the details list: absolute, with the relative time muted. */
function Observed({ value }: { value: string | null }) {
  const ms = Date.parse(value ?? "");
  if (!Number.isFinite(ms)) return <Text color="secondary">Not recorded</Text>;
  return (
    <HStack gap={2} wrap="wrap" vAlign="center">
      <Text>{LOCAL_TIME.format(ms)}</Text>
      <Text color="secondary">
        <RelativeTime value={value} />
      </Text>
    </HStack>
  );
}

function Evidence({
  title,
  value,
}: {
  title: string;
  value: Record<string, unknown>;
}) {
  const fields = evidenceFields(value);
  if (!fields.length) return null;
  return (
    <Collapsible trigger={<Text>{title}</Text>} defaultIsOpen={false}>
      <VStack gap={3} className="data-evidence">
        <MetadataList label={{ position: "top" }} columns="multi">
          {fields.map(([name, entry]) => (
            <MetadataListItem key={name} label={name}>
              <Text wordBreak="break-word">{entry}</Text>
            </MetadataListItem>
          ))}
        </MetadataList>
        <HStack>
          <Button
            label="Copy JSON"
            tooltip="Copy JSON"
            isIconOnly
            size="sm"
            variant="ghost"
            icon={<CopyIcon weight="regular" aria-hidden="true" />}
            onClick={() =>
              void navigator.clipboard?.writeText(
                JSON.stringify(value, null, 2),
              )
            }
          />
        </HStack>
      </VStack>
    </Collapsible>
  );
}

function History({ record }: { record: DataRecord }) {
  const { revisions, historyLimit } = record;
  if (!revisions.length) return null;
  const capped = historyLimit !== null && revisions.length >= historyLimit;
  return (
    <Collapsible
      trigger={
        <HStack gap={2} vAlign="center">
          <Text>History</Text>
          <span
            className="workspace-count data-history-count"
            title={
              capped
                ? `Latest ${historyLimit} revisions; older ones are kept`
                : undefined
            }
          >
            {capped ? `${historyLimit}+` : revisions.length}
          </span>
        </HStack>
      }
      defaultIsOpen={false}
    >
      <ol className="data-history" aria-label="Revision history">
        {revisions.map((revision) => (
          <li key={revision.id} title={revision.id}>
            <Text>{revision.version ?? "Unknown version"}</Text>
            {revision.id === record.revisionId && (
              <StateBadge tone="neutral" label="Current" />
            )}
            <Text color="secondary" className="data-history-time">
              <RelativeTime value={revision.observedAt} />
            </Text>
          </li>
        ))}
      </ol>
    </Collapsible>
  );
}

/**
 * One record. On its own it is the page: an icon back, the title as the H1,
 * the body first, then one row of facts with the full fields collapsed.
 * Beside the list it takes a close icon and an H2.
 */
export function RecordDetail({
  record,
  busy,
  failure,
  moreFailed = false,
  onMore,
  onRetry,
  onClose,
  split = false,
  panelRef,
  id,
}: {
  record: DataRecord | null;
  busy: boolean;
  failure: Failure | null;
  /** The next part of the body could not be read. */
  moreFailed?: boolean;
  onMore: () => void;
  onRetry?: () => void;
  onClose?: () => void;
  split?: boolean;
  panelRef?: React.Ref<HTMLElement>;
  id?: string;
}) {
  const title = record ? (record.title ?? "Untitled") : "Record";
  const close = onClose && (
    <Button
      label={split ? "Close record" : "Back to records"}
      tooltip={split ? "Close record" : "Back to records"}
      isIconOnly
      size="sm"
      variant="ghost"
      icon={
        split ? (
          <XIcon weight="regular" aria-hidden="true" />
        ) : (
          <ArrowBendUpLeftIcon weight="regular" aria-hidden="true" />
        )
      }
      onClick={onClose}
    />
  );
  const [Glyph, kindName] = kindGlyph(record?.kind);
  const effective = record
    ? effectiveDate(record.occurredAt, record.datePrecision)
    : null;
  return (
    <section
      id={id}
      ref={panelRef}
      tabIndex={-1}
      aria-label={`${title} details`}
      className="workspace-detail data-detail"
      data-split={split ? "true" : "false"}
    >
      <VStack gap={5}>
        {close && <div className="data-detail-bar">{close}</div>}
        {!record ? (
          failure ? (
            <ReadNotice result={failure} onRetry={onRetry} />
          ) : (
            busy && <LoadingSkeleton label="record" rows={3} columns={2} />
          )
        ) : (
          <>
            <HStack gap={3} vAlign="center" wrap="wrap">
              <Heading level={split ? 2 : 1} className="data-detail-title">
                {title}
              </Heading>
              <StateBadge domain="record" state={record.status} />
              <TierMark tier={record.tier} />
            </HStack>
            {record.body && (
              <Text as="p" className="workspace-detail-body">
                {record.body}
              </Text>
            )}
            {record.nextBodyOffset !== null && (
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
            {moreFailed && (
              <InlineNotice tone="warning" title="Next part unreadable" />
            )}
            <ul className="data-facts" aria-label="Record facts">
              <li title="Kind">
                <Glyph weight="regular" aria-hidden="true" />
                {kindName}
              </li>
              {record.source && (
                <li>
                  <SourceName id={record.source} />
                </li>
              )}
              {effective && (
                <li title="Effective date">
                  <CalendarBlankIcon weight="regular" aria-hidden="true" />
                  {effective}
                </li>
              )}
              <li title="Observed">
                <EyeIcon weight="regular" aria-hidden="true" />
                <RelativeTime value={record.observedAt} label="Observed" />
              </li>
            </ul>
            <VStack gap={1}>
              <Collapsible trigger={<Text>Details</Text>} defaultIsOpen={false}>
                <MetadataList
                  className="data-fields"
                  label={{ position: "top" }}
                  columns="multi"
                >
                  {(
                    [
                      ["Kind", kindName],
                      ["Source", record.source ?? "Not reported"],
                      ["Source reference", record.sourceUri ?? "Not reported"],
                      ["Effective", effective ?? "Not reported"],
                      ["Record", record.id],
                    ] as const
                  ).map(([name, value]) => (
                    <MetadataListItem key={name} label={name}>
                      <Text wordBreak="break-word">{value}</Text>
                    </MetadataListItem>
                  ))}
                  <MetadataListItem label="Observed">
                    <Observed value={record.observedAt} />
                  </MetadataListItem>
                </MetadataList>
              </Collapsible>
              <History record={record} />
              {record.assertion && (
                <Evidence title="Assertion" value={record.assertion} />
              )}
              {record.metadata && (
                <Evidence title="Capture coverage" value={record.metadata} />
              )}
            </VStack>
          </>
        )}
      </VStack>
    </section>
  );
}

function pageAfter(result: LifeResult, offset: number): number | null {
  if (result.state !== "ready") return null;
  try {
    return nextLifeOffset(result.data.next_offset, offset);
  } catch {
    return null;
  }
}

/** Keys an element listens to that Escape belongs to instead. */
const OWNS_ESCAPE =
  "input, textarea, select, [contenteditable], [role='dialog'], [role='menu'], [role='listbox']";

/**
 * Records: one live search with kind and source filters. An empty query
 * lists the most recent records. Opening a record moves to
 * /data/records/<id> in this document, so the private session carries over;
 * back, Escape and the back icon return to the list with focus on the row.
 * The list is read only while it is shown.
 */
export function RecordsExplorer({
  reader,
  route,
  navigate,
  split,
  onCount,
}: {
  reader: LifeReader;
  route: RecordsRoute;
  navigate: DataNavigate;
  split: boolean;
  onCount?: (count: number | undefined) => void;
}) {
  const { id, kind, source } = route;
  const detailId = useId();
  const [search, setSearch] = useState({ q: "", n: 0 });
  const [list, setList] = useState<List | null>(null);
  // The records this session has listed are what the palette finds under
  // Data. They go with the list: a locked or ended session remounts it.
  const items = list?.items;
  useEffect(
    () =>
      items?.length
        ? provideSearchEntries(
            "data",
            items.map((item) => {
              const [icon, kindName] = kindGlyph(item.kind);
              return {
                id: `data:record:${item.id}`,
                label: item.title ?? "Untitled",
                domain: "life" as const,
                kind: "record",
                currentFact: kindName,
                source: item.source ?? "",
                freshness: "current",
                href: dataRecordHref(item.id),
                keywords: [kindName],
                icon,
              };
            }),
          )
        : undefined,
    [items],
  );
  const [busy, setBusy] = useState(false);
  const [record, setRecord] = useState<DataRecord | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [moreFailed, setMoreFailed] = useState(false);
  const listSession = useRef(new LifeReadSession());
  const detailSession = useRef(new LifeReadSession());
  const reads = useRef(0);
  const loaded = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const focusRow = useRef<number | null>(null);
  const pushedFor = useRef<string | null>(null);
  const shown = useRef(id);

  async function load(append: boolean) {
    const token = ++reads.current;
    const start = append ? (list?.next ?? 0) : 0;
    setBusy(true);
    const found: DataRecord[] = [];
    let offset: number | null = start;
    let total: number | null = null;
    let pages = 0;
    do {
      const result: LifeResult | null = await listSession.current.run(reader, {
        method: "search",
        q: search.q,
        offset,
        ...(DATA_KINDS[kind].reader ? { kind: DATA_KINDS[kind].reader } : {}),
      });
      if (!result || token !== reads.current) return;
      if (result.state !== "ready") {
        setBusy(false);
        setList((previous) =>
          append && previous
            ? { ...previous, failure: result }
            : { items: [], total: null, next: null, failure: result },
        );
        return;
      }
      const items = parseItems(result.data, parseRecord);
      found.push(
        ...(source ? items.filter((item) => item.source === source) : items),
      );
      total = typeof result.data.total === "number" ? result.data.total : null;
      offset = pageAfter(result, offset ?? 0);
      pages += 1;
    } while (
      source &&
      offset !== null &&
      found.length < SOURCE_PAGE_FILL &&
      pages < SOURCE_PAGE_READS
    );
    setBusy(false);
    setList((previous) => {
      const base = append && previous ? previous.items : [];
      const seen = new Set(base.map((item) => item.id));
      const items = [...base, ...found.filter((item) => !seen.has(item.id))];
      return {
        items,
        total: source ? (offset === null ? items.length : null) : total,
        next: offset,
        failure: null,
      };
    });
  }

  async function open(recordId: string) {
    setRecord(null);
    setFailure(null);
    setMoreFailed(false);
    setDetailBusy(true);
    const next = await detailSession.current.run(reader, {
      method: "get",
      id: recordId,
    });
    if (!next) return;
    setDetailBusy(false);
    if (next.state !== "ready") return setFailure(next);
    const parsed = parseRecord(next.data);
    if (parsed) setRecord(parsed);
    else setFailure({ state: "invalid", message: "" });
  }

  async function more() {
    if (!record || record.nextBodyOffset === null) return;
    const current = record;
    const offset = record.nextBodyOffset;
    setDetailBusy(true);
    setMoreFailed(false);
    const next = await detailSession.current.run(reader, {
      method: "get",
      id: current.id,
      body_offset: offset,
    });
    if (!next) return;
    setDetailBusy(false);
    try {
      if (next.state !== "ready") throw new Error("unreadable");
      setRecord(parseRecord(appendLifeBody(current.raw, next.data)));
    } catch {
      setMoreFailed(true);
    }
  }

  // The list, whenever it is shown and its query or filters change.
  const listShown = !id || split;
  const key = `${kind}|${source}|${search.n}`;
  useEffect(() => {
    if (!listShown || loaded.current === key) return;
    loaded.current = key;
    void load(false);
    // `key` stands for the query and filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, listShown]);

  // The record, whenever the route names one.
  useEffect(() => {
    const previous = shown.current;
    shown.current = id;
    if (id !== pushedFor.current) pushedFor.current = null;
    if (id) {
      void open(id);
      requestAnimationFrame(() =>
        panel.current?.focus({ preventScroll: true }),
      );
    } else {
      detailSession.current.invalidate();
      setRecord(null);
      setFailure(null);
      // Back on the list: focus returns to the row that opened the record.
      if (previous)
        requestAnimationFrame(() =>
          listRef.current
            ?.querySelector<HTMLElement>(
              `a[href^="${dataRecordHref(previous)}"]`,
            )
            ?.focus(),
        );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(
    () => () => {
      reads.current += 1;
      listSession.current.invalidate();
      detailSession.current.invalidate();
    },
    [],
  );

  useEffect(() => {
    onCount?.(list && !list.failure ? (list.total ?? undefined) : undefined);
  }, [list, onCount]);

  // After Load more, focus moves to the first new row.
  useEffect(() => {
    if (focusRow.current === null) return;
    const index = focusRow.current;
    focusRow.current = null;
    listRef.current
      ?.querySelectorAll<HTMLElement>("[data-row-link]")
      [index]?.focus();
  }, [list]);

  const filter = { kind, source };
  const close = () => {
    if (pushedFor.current === id) window.history.back();
    else navigate(dataRecordsHref(filter));
  };
  useEffect(() => {
    if (!id) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if ((event.target as Element | null)?.closest?.(OWNS_ESCAPE)) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // Beside the list, another record replaces the open one in history, so
  // closing always lands back on the list.
  const select = (item: DataRecord) => {
    if (item.id === id) return;
    const replace = id !== null;
    pushedFor.current = !replace || pushedFor.current === id ? item.id : null;
    navigate(dataRecordHref(item.id, filter), { replace });
  };
  const reset = () => {
    setSearch(({ n }) => ({ q: "", n: n + 1 }));
    if (kind !== "all" || source)
      navigate(dataRecordsHref(), { replace: true });
  };
  const filtered = Boolean(search.q || kind !== "all" || source);

  return (
    <div className="workspace-split" data-detail-open={id ? "true" : "false"}>
      <VStack gap={4} className="workspace-split-list" ref={listRef}>
        <RecordsToolbar
          route={route}
          navigate={navigate}
          query={search.q}
          onSearch={(q) => setSearch(({ n }) => ({ q, n: n + 1 }))}
          onClear={() => setSearch(({ n }) => ({ q: "", n: n + 1 }))}
          busy={busy}
        />
        {!list ? (
          <LoadingSkeleton label="records" columns={4} />
        ) : list.failure && !list.items.length ? (
          <ReadNotice result={list.failure} onRetry={() => void load(false)} />
        ) : list.items.length ? (
          <VStack gap={3} aria-busy={busy}>
            <DataTable
              rows={list.items}
              rowKey="id"
              columns={recordColumns({
                href: (item) => dataRecordHref(item.id, filter),
                onSelect: select,
                selectedId: id,
                controls: id ? detailId : undefined,
                hideSource: Boolean(source),
              })}
              label={search.q ? "Search results" : "Recent records"}
              noun={["record", "records"]}
              footer={false}
            />
            {list.failure && (
              <InlineNotice tone="warning" title="More records unreadable" />
            )}
            {list.next !== null && (
              <HStack>
                <Button
                  label="Load more"
                  size="sm"
                  variant="secondary"
                  isLoading={busy}
                  onClick={() => {
                    focusRow.current = list.items.length;
                    void load(true);
                  }}
                />
              </HStack>
            )}
          </VStack>
        ) : (
          <StateNotice
            kind="empty"
            title="No matching records"
            action={
              filtered ? (
                <Button label="Clear filters" size="sm" onClick={reset} />
              ) : undefined
            }
          />
        )}
      </VStack>
      {id && (
        <RecordDetail
          id={detailId}
          panelRef={panel}
          record={record}
          busy={detailBusy}
          failure={failure}
          moreFailed={moreFailed}
          split={split}
          onMore={() => void more()}
          onRetry={() => void open(id)}
          onClose={close}
        />
      )}
    </div>
  );
}
