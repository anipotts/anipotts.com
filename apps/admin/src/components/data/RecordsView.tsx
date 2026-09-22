import React, { useEffect, useId, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import {
  ToggleButton,
  ToggleButtonGroup,
} from "@astryxdesign/core/ToggleButton";
import { VStack } from "@astryxdesign/core/VStack";
import { XIcon } from "@phosphor-icons/react";
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
  /** No row shows a state chip, so the state column holds only the tier
   * glyph and gives the rest of its width to the titles. */
  tiersOnly?: boolean;
}): Column<DataRecord>[] {
  const columns: Column<DataRecord>[] = [
    {
      key: "record",
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
            mobile={
              <>
                <TierMark tier={record.tier} />
                <StateBadge domain="record" state={record.status} />
                {record.excerpt ? (
                  <span className="data-record-excerpt">{record.excerpt}</span>
                ) : (
                  !hideSource && <RecordSource record={record} />
                )}
              </>
            }
            time={record.observedAt}
          />
        );
      },
    },
  ];
  if (!beside && !hideSource)
    columns.push({
      key: "source",
      header: "Source",
      width: SOURCE_WIDTH,
      hideBelow: "large",
      render: (record) => <RecordSource record={record} slot />,
    });
  columns.push(
    tiersOnly
      ? {
          key: "state",
          header: <span className="sr-only">Tier</span>,
          width: CELL_WIDTHS.tile,
          render: (record) => <RecordState record={record} />,
        }
      : {
          key: "state",
          header: "State",
          width: CELL_WIDTHS.state,
          render: (record) => <RecordState record={record} />,
        },
    {
      key: "observed",
      header: "Observed",
      width: CELL_WIDTHS.time,
      render: (record) => <RelativeTime value={record.observedAt} />,
    },
  );
  return columns;
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
      header: "Match",
      hideBelow: "large",
      render: (record) => <DetailText>{record.excerpt ?? ""}</DetailText>,
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

function pageAfter(result: DataResult, offset: number): number | null {
  if (result.state !== "ready") return null;
  try {
    return nextDataOffset(result.data.next_offset, offset);
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
  reader: DataReader;
  route: RecordsRoute;
  navigate: DataNavigate;
  split: boolean;
  onCount?: (count: number | undefined) => void;
}) {
  const { id, kind, source } = route;
  const detailId = useId();
  const [search, setSearch] = useState({ q: "", n: 0 });
  const [list, setList] = useState<List | null>(null);
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
      const result: DataResult | null = await listSession.current.run(reader, {
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
      setRecord(parseRecord(appendDataBody(current.raw, next.data)));
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

  const beside = split && id !== null;
  const columns = recordColumns({
    href: (item) => dataRecordHref(item.id, filter),
    onSelect: select,
    selectedId: id,
    controls: id ? detailId : undefined,
    hideSource: Boolean(source),
    beside,
    // Beside an open record the titles take the state column's width when
    // no row has a state to show.
    tiersOnly:
      beside &&
      (list?.items ?? []).every(
        (item) => badgeFor("record", item.status).isDefault,
      ),
  });

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
              <LoadingSkeleton label="records" columns={4} />
            ) : list.failure && !list.items.length ? (
              <ReadNotice
                result={list.failure}
                onRetry={() => void load(false)}
              />
            ) : list.items.length ? (
              <VStack gap={3} aria-busy={busy}>
                <DataTable
                  rows={list.items}
                  rowKey="id"
                  columns={withMatch(columns, list.items, beside)}
                  label={search.q ? "Search results" : "Recent records"}
                  noun={["record", "records"]}
                  footer={false}
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
