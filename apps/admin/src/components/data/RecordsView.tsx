import React, { useEffect, useId, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { VStack } from "@astryxdesign/core/VStack";
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { nextDataOffset, type DataResult } from "../../data/personal-context";
import {
  DataReadSession,
  appendDataBody,
  type DataReader,
} from "../../lib/data-read-session";
import {
  DATA_KINDS,
  dataKind,
  dataRecordHref,
  dataRecordsHref,
  type DataKind,
  type RecordsRoute,
} from "../../lib/data-routes";
import { deviceName } from "../../lib/naming";
import { effectiveDate, occurredText } from "../../lib/data-record";
import { useLiveText } from "../../lib/live-clock";
import { KindFilters } from "../workspace/KindFilters";
import { BrandTile } from "../BrandTile";
import { SplitView, useSplitView } from "../astryx/SplitView";
import {
  badgeFor,
  CELL_WIDTHS,
  DataTable,
  DetailText,
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
  kindGlyph,
  parseItems,
  parseRecord,
  recordMark,
  type DataRecord,
} from "./data-model";
import { ReadNotice, type DataNavigate } from "./DataNotices";
import { RecordPanel } from "./RecordPanel";
import {
  SourceNamesContext,
  namedSource,
  useNamedSource,
  useSourceNames,
} from "./source-catalog";
import { provideSearchEntries } from "../../lib/admin-search-index";

type Failure = Exclude<DataResult, { state: "ready" }>;

/** A record's source as its column shows it: the device tile when System
 * names one, then the source's name as Sources reads it. The row's lead
 * tile is already the source's app, so the column does not repeat it. */
function RecordSource({
  record,
  slot = false,
}: {
  record: DataRecord;
  /** In the Source column every cell keeps the device's place, empty or
   * not, so the names line up down the column. */
  slot?: boolean;
}) {
  const source = useNamedSource(record.source, record.host);
  if (!source) return null;
  const device = source.device && record.host && (
    <BrandTile
      id={source.device.id}
      kind="device"
      size={20}
      label={deviceName(record.host)}
    />
  );
  return (
    <span className="data-source" title={source.tooltip}>
      {slot ? <span className="data-source-device">{device}</span> : device}
      <span className="data-source-name">{source.name}</span>
    </span>
  );
}

/** A record's state column: a state other than the default as its chip,
 * then the tier glyph at the column's end, so tiers read down one line. */
function RecordState({ record }: { record: DataRecord }) {
  return (
    <span className="data-record-state">
      <StateBadge domain="record" state={record.status} />
      <TierMark tier={record.tier} />
    </span>
  );
}

/**
 * When a record happened: the date the reader's list is sorted by (ledger
 * A-28). System orders records by occurred date, newest first, and those
 * with none last by observed time, so this column is that key: the occurred
 * date, relative within a day and otherwise at System's own precision
 * (lib/data-record.ts occurredText), or, for a record System holds no
 * occurred date for, its observed time, muted and labelled as observed.
 */
function OccurredTime({ record }: { record: DataRecord }) {
  const occurred = Boolean(
    occurredText(record.occurredAt, record.datePrecision, Date.now()),
  );
  const value = occurred ? record.occurredAt : record.observedAt;
  const text = useLiveText(
    (now) =>
      (occurred
        ? occurredText(record.occurredAt, record.datePrecision, now)
        : occurredText(record.observedAt, null, now)) ?? "",
    Date.now(),
  );
  if (!text)
    return (
      <Text color="secondary" className="workspace-time">
        Not recorded
      </Text>
    );
  const full = occurred
    ? `Occurred: ${effectiveDate(record.occurredAt, record.datePrecision)}`
    : `Observed: ${effectiveDate(record.observedAt, null)}. No occurred date`;
  return (
    <time
      className="workspace-time"
      data-observed={occurred ? undefined : ""}
      dateTime={value ?? undefined}
      title={full}
      aria-label={full}
      suppressHydrationWarning
    >
      {text}
    </time>
  );
}

/** Source names are short ("Browsing", "Voice Memos"); the column holds
 * them with a device tile. */
const SOURCE_WIDTH = 204;

/**
 * Record rows, for Records and the overview: one row of aligned columns.
 * The lead is the app tile (the kind's glyph when the source has none) and
 * the short title; then the source, the state and tier, and the time. A
 * search adds the reader's excerpt as a Match column in place of the source.
 * Beside an open record the list keeps only the lead, the state and the
 * time. On phones a row is two lines: the title and time, then the tier, a
 * state other than the default and the source (or the excerpt).
 */
export function recordColumns({
  href,
  onSelect,
  selectedId = null,
  controls,
  hideSource = false,
  beside = false,
  tiersOnly = false,
}: {
  href: (record: DataRecord) => string;
  onSelect?: (record: DataRecord, trigger: HTMLElement) => void;
  selectedId?: string | null;
  controls?: string;
  /** Every row has the same source, so no row names it. */
  hideSource?: boolean;
  /** An open record sits beside the list. */
  beside?: boolean;
  /** No row shows a state chip (recordTiersOnly), so the state column
   * holds only the tier glyph under an assistive "Tier" heading and gives
   * the rest of its width to the titles. */
  tiersOnly?: boolean;
}): Column<DataRecord>[] {
  const columns: Column<DataRecord>[] = [
    {
      key: "record",
      priority: 0,
      header: "Record",
      render: (record) => {
        const mark = recordMark(record);
        return (
          <RowTitle
            icon={mark.tile ? undefined : mark.glyph}
            mark={
              mark.tile ? (
                <BrandTile id={mark.tile.id} kind={mark.tile.kind} />
              ) : undefined
            }
            kind={mark.kindName}
            title={mark.name}
            tooltip={
              record.title && record.title !== mark.name
                ? `${record.title}\n${record.id}`
                : record.id
            }
            href={href(record)}
            onSelect={
              onSelect ? (trigger) => onSelect(record, trigger) : undefined
            }
            isPressed={onSelect ? selectedId === record.id : undefined}
            controls={controls}
            secondary={
              record.excerpt ? (
                <span className="data-record-excerpt">{record.excerpt}</span>
              ) : undefined
            }
            end={<OccurredTime record={record} />}
          />
        );
      },
    },
  ];
  if (!beside && !hideSource)
    columns.push({
      key: "source",
      compactLabel: false,
      priority: 2,
      header: "Source",
      width: SOURCE_WIDTH,
      hideBelow: "large",
      render: (record) => <RecordSource record={record} slot />,
    });
  columns.push(
    tiersOnly
      ? {
          key: "state",
          compact: "inline",
          compactLabel: false,
          priority: 1,
          header: <span className="sr-only">Tier</span>,
          width: CELL_WIDTHS.tile,
          render: (record) => <RecordState record={record} />,
        }
      : {
          key: "state",
          compact: "inline",
          compactLabel: false,
          priority: 1,
          header: "State",
          width: CELL_WIDTHS.state,
          render: (record) => <RecordState record={record} />,
        },
    {
      key: "occurred",
      compact: "trailing",
      compactLabel: false,
      priority: 1,
      header: "Occurred",
      width: CELL_WIDTHS.time,
      render: (record) => <OccurredTime record={record} />,
    },
  );
  return columns;
}

/** Whether no listed record has a non-default state, so the state column
 * holds only tier glyphs (recordColumns' `tiersOnly`). */
export function recordTiersOnly(records: readonly DataRecord[]): boolean {
  return records.every((item) => badgeFor("record", item.status).isDefault);
}

/** A search's rows add the reader's excerpt, the one flexible column beside
 * the lead, in place of the source. */
function withMatch(
  columns: Column<DataRecord>[],
  rows: DataRecord[],
  beside: boolean,
): Column<DataRecord>[] {
  if (beside || !rows.some((row) => row.excerpt)) return columns;
  const [lead, ...rest] = columns;
  return [
    lead!,
    {
      key: "match",
      compact: "detail",
      compactLabel: true,
      priority: 2,
      header: "Match",
      hideBelow: "large",
      render: (record) => (
        <DetailText lines={1}>{record.excerpt ?? ""}</DetailText>
      ),
    },
    ...rest.filter((column) => column.key !== "source"),
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
  const source = useNamedSource(route.source);
  return (
    <div className="data-toolbar data-records-toolbar">
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
                weight="regular"
                aria-hidden="true"
                className="data-chip-clear"
              />
            </span>
          </ToggleButton>
        )}
        <KindFilters
          label="Record kind"
          disabled={disabled}
          value={route.kind === "all" ? null : route.kind}
          onChange={(value) => filter({ kind: dataKind(value) })}
          options={(
            [
              "message",
              "browsing_day",
              ...KIND_CHIPS.filter(
                (kind) => !["message", "browsing_day"].includes(kind),
              ),
            ] as DataKind[]
          ).map((kind) => {
            const [Glyph] = kindGlyph(DATA_KINDS[kind].reader);
            return {
              value: kind,
              label: DATA_KINDS[kind].label,
              icon: <Glyph weight="regular" aria-hidden="true" />,
            };
          })}
        />
      </div>
    </div>
  );
}

/** Bound compatibility scanning when an older reader rejects source filters. */
const SOURCE_PAGE_READS = 5;
const SOURCE_PAGE_FILL = 10;

type List = {
  key: string;
  reader: DataReader;
  items: DataRecord[];
  /** The reader's total for the search; unknown while a source filter
   * applies and more pages remain. */
  total: number | null;
  next: number | null;
  failure: Failure | null;
};

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
  reader: DataReader;
  route: RecordsRoute;
  navigate: DataNavigate;
  split: boolean;
  onCount?: (count: number | undefined) => void;
}) {
  const { id, kind, source } = route;
  const detailId = useId();
  const [search, setSearch] = useState({ q: "", n: 0 });
  const key = `${kind}|${source}|${search.n}`;
  const [resultList, setList] = useState<List | null>(null);
  const list =
    resultList?.key === key && resultList.reader === reader ? resultList : null;
  const names = useSourceNames(reader);
  // The records this session has listed are what the palette finds under
  // Data. They go with the list: a locked or ended session remounts it.
  const items = list?.items;
  useEffect(
    () =>
      items?.length
        ? provideSearchEntries(
            "data",
            items.map((item) => {
              const mark = recordMark(item);
              return {
                id: `data:record:${item.id}`,
                label: mark.name,
                domain: "data" as const,
                kind: "record",
                currentFact: mark.kindName,
                source: item.source
                  ? namedSource(item.source, names, item.host).name
                  : "",
                freshness: "current",
                href: dataRecordHref(item.id),
                // The title as the reader wrote it still finds the record.
                keywords: [mark.kindName, ...(item.title ? [item.title] : [])],
                icon: mark.glyph,
              };
            }),
          )
        : undefined,
    [items, names],
  );
  const [busy, setBusy] = useState(false);
  const [record, setRecord] = useState<DataRecord | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [moreFailed, setMoreFailed] = useState(false);
  const listSession = useRef(new DataReadSession());
  const detailSession = useRef(new DataReadSession());
  const reads = useRef(0);
  const loaded = useRef<{ key: string; reader: DataReader } | null>(null);
  const legacyReader = useRef<DataReader | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const focusRow = useRef<number | null>(null);
  const pushedFor = useRef<string | null>(null);
  const shown = useRef(id);

  async function load(append: boolean) {
    if (append && (list?.next == null || busy)) return;
    if (!append) {
      focusRow.current = null;
      // The local source filter can change without changing the reader request.
      listSession.current.invalidate();
    }
    const token = ++reads.current;
    const start = append ? (list?.next ?? 0) : 0;
    setBusy(true);
    const found: DataRecord[] = [];
    let offset: number | null = start;
    let total = append ? (list?.total ?? null) : null;
    let pages = 0;
    let failure: Failure | null = null;
    let sourceOnReader = source !== null && legacyReader.current !== reader;
    let keepExisting = append;
    do {
      const result: DataResult | null = await listSession.current.run(reader, {
        method: "search",
        q: search.q,
        offset,
        ...(DATA_KINDS[kind].reader ? { kind: DATA_KINDS[kind].reader } : {}),
        ...(sourceOnReader && source ? { source } : {}),
      });
      if (!result || token !== reads.current) return;
      if (result.state !== "ready") {
        if (
          sourceOnReader &&
          result.state === "invalid" &&
          result.unsupported === "source-filter"
        ) {
          legacyReader.current = reader;
          sourceOnReader = false;
          // A filtered offset cannot continue in an unfiltered result set.
          keepExisting = false;
          found.length = 0;
          offset = 0;
          total = null;
          pages = 0;
          if (focusRow.current !== null) focusRow.current = 0;
          continue;
        }
        failure = result;
        break;
      }
      const items = parseItems(result.data, parseRecord);
      if (
        sourceOnReader &&
        (result.data.source !== source ||
          items.some((item) => item.source !== source))
      ) {
        failure = {
          state: "invalid",
          message: "The reader did not apply the requested source.",
        };
        break;
      }
      found.push(
        ...(source ? items.filter((item) => item.source === source) : items),
      );
      total = typeof result.data.total === "number" ? result.data.total : null;
      try {
        offset = nextDataOffset(result.data.next_offset, offset);
      } catch {
        failure = {
          state: "invalid",
          message: "The reader returned an invalid continuation.",
        };
        // Repeat this page after retry. Existing results are deduplicated below.
        break;
      }
      pages += 1;
    } while (
      source &&
      !sourceOnReader &&
      offset !== null &&
      found.length < SOURCE_PAGE_FILL &&
      pages < SOURCE_PAGE_READS
    );
    setBusy(false);
    setList((previous) => {
      const base =
        keepExisting && previous?.key === key && previous.reader === reader
          ? previous.items
          : [];
      const seen = new Set(base.map((item) => item.id));
      const items = [...base];
      for (const item of found) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
      }
      return {
        key,
        reader,
        items,
        total:
          source && !sourceOnReader
            ? offset === null
              ? items.length
              : null
            : total,
        next: offset,
        failure,
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
      setRecord(parseRecord(appendDataBody(current.raw, next.data)));
    } catch {
      setMoreFailed(true);
    }
  }

  // The list, whenever it is shown and its query or filters change.
  const listShown = !id || split;
  useEffect(() => {
    if (
      !listShown ||
      (loaded.current?.key === key && loaded.current.reader === reader)
    )
      return;
    loaded.current = { key, reader };
    void load(false);
    // `key` stands for the query and filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, listShown, reader]);

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

  const beside = split && id !== null;
  const columns = recordColumns({
    href: (item) => dataRecordHref(item.id, filter),
    onSelect: select,
    selectedId: id,
    controls: id ? detailId : undefined,
    hideSource: Boolean(source),
    beside,
    // Keep the header and width fixed before and after rows arrive.
    tiersOnly: false,
  });
  const continueSearch = () => {
    if (busy) return;
    focusRow.current = list?.items.length ?? 0;
    void load(true);
  };

  return (
    <SourceNamesContext value={names}>
      <SplitView
        className="data-records"
        listClassName="data-records-list"
        list={
          <VStack gap={4} ref={listRef}>
            <RecordsToolbar
              route={route}
              navigate={navigate}
              query={search.q}
              onSearch={(q) => setSearch(({ n }) => ({ q, n: n + 1 }))}
              onClear={() => setSearch(({ n }) => ({ q: "", n: n + 1 }))}
              busy={busy}
            />
            {!list ? (
              <LoadingSkeleton label="records" columns={columns} footer />
            ) : list.failure && !list.items.length ? (
              <ReadNotice result={list.failure} onRetry={continueSearch} />
            ) : list.items.length ? (
              <VStack gap={3} aria-busy={busy}>
                <DataTable
                  tableId="data-records"
                  searchActive={filtered}
                  totalCount={!filtered ? (list.total ?? undefined) : undefined}
                  filteredCount={
                    filtered ? (list.total ?? undefined) : undefined
                  }
                  rows={list.items}
                  rowKey="id"
                  columns={withMatch(columns, list.items, beside)}
                  label={search.q ? "Search results" : "Recent records"}
                  noun={["record", "records"]}
                />
                {list.failure && (
                  <InlineNotice
                    tone="warning"
                    title="More records unreadable"
                  />
                )}
                {list.next !== null && (
                  <HStack>
                    <Button
                      label={list.failure ? "Retry more records" : "Load more"}
                      size="sm"
                      variant="secondary"
                      isLoading={busy}
                      onClick={continueSearch}
                    />
                  </HStack>
                )}
              </VStack>
            ) : list.next !== null ? (
              <InlineNotice
                tone="info"
                title="More records to search"
                icon={MagnifyingGlassIcon}
                action={
                  <Button
                    label="Load more"
                    size="sm"
                    variant="secondary"
                    isLoading={busy}
                    onClick={continueSearch}
                  />
                }
              />
            ) : (
              <StateNotice
                kind="empty"
                title={filtered ? "No matching records" : "No records yet"}
                action={
                  filtered ? (
                    <Button label="Clear filters" size="sm" onClick={reset} />
                  ) : undefined
                }
              />
            )}
          </VStack>
        }
        panel={
          id && (
            <RecordPanel
              id={detailId}
              panelRef={panel}
              record={record}
              busy={detailBusy}
              failure={failure}
              moreFailed={moreFailed}
              onMore={() => void more()}
              onRetry={() => void open(id)}
              onClose={close}
            />
          )
        }
      />
    </SourceNamesContext>
  );
}
