import React, { useMemo, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import { VStack } from "@astryxdesign/core/VStack";
import { BroadcastIcon, ListBulletsIcon } from "@phosphor-icons/react";
import {
  humanize,
  opsActivitySource,
  opsRouteLabel,
  type OpsEvent,
} from "../../lib/ops-events";
import {
  opsActivityRows,
  opsPlumbingCount,
  type OpsActivityRow,
} from "../../lib/ops-view";
import { opsMark } from "../../lib/marks";
import { deviceName } from "../../lib/naming";
import {
  CELL_WIDTHS,
  DataTable,
  DayLabel,
  DetailText,
  Duration,
  FilterMenu,
  RowTitle,
  StateNotice,
  StateTransition,
  type Column,
} from "../workspace/Workspace";
import {
  DeviceTile,
  EntryTile,
  HourTime,
  HttpStatus,
  RunResult,
  entryKind,
  entryNaming,
  routeMark,
} from "./cells";
import { OpsPage, catalogOf, type OpsCatalog, type OpsData } from "./frame";
import { opsEntryHref } from "./StatusView";
import { BrandTile } from "../BrandTile";

/** Rows per step of Activity; "Show more" adds another step. */
const ACTIVITY_STEP = 100;

type Row = OpsActivityRow;

/** The entry an event is about, when the catalog holds it. */
function entryOf(event: OpsEvent, catalog: OpsCatalog) {
  return event.kind === "access" ? undefined : catalog.get(event.subject);
}

/** The median of a burst's latencies. */
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

/** A burst's worst result: the highest HTTP status, or a non-zero exit. */
function worstStatus(row: Row) {
  return Math.max(
    ...row.events.map((event) => (event.kind === "access" ? event.status : 0)),
  );
}
function worstExit(row: Row) {
  const exits = row.events.map((event) =>
    event.kind === "run" ? event.exit : null,
  );
  return (
    exits.find((exit) => exit !== null && exit !== 0) ??
    (exits.some((exit) => exit === 0) ? 0 : null)
  );
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** A burst's size as "×3", said in full for assistive technology and the
 * tooltip, so it never crowds the chips beside it. */
function Burst({ count, noun }: { count: number; noun: [string, string] }) {
  const said = plural(count, noun[0], noun[1]);
  return (
    <span className="ops-burst workspace-figure" title={said}>
      <span aria-hidden="true">×{count}</span>
      <span className="sr-only">{said}</span>
    </span>
  );
}

/** How long it took, inside the Change cell, where the Took column has
 * dropped (medium); CSS shows it only there. */
function TookInline({ row }: { row: Row }) {
  return (
    <span className="ops-change-took" aria-hidden="true">
      <Took row={row} />
    </span>
  );
}

/** What changed: the two states of a transition (a burst of one pair, or a
 * burst that came back, through the worst state it reached), a run's
 * result, a read's status code, each with the burst's count. A detail that
 * has no room left is dropped rather than shown as a sliver
 * (observability-workspace.css). */
function Change({ row, catalog }: { row: Row; catalog: OpsCatalog }) {
  const { latest, earliest } = row;
  if (latest.kind === "transition" && earliest.kind === "transition")
    return (
      <span className="ops-change">
        <StateTransition
          domain="ops"
          from={earliest.from}
          via={row.via}
          to={latest.to}
        />
        {row.via
          ? row.flaps > 1 && (
              <Burst count={row.flaps} noun={["round trip", "round trips"]} />
            )
          : row.count > 1 && (
              <Burst count={row.count} noun={["change", "changes"]} />
            )}
        {latest.detail && <DetailText>{latest.detail}</DetailText>}
      </span>
    );
  if (latest.kind === "run")
    return (
      <span className="ops-change">
        <RunResult
          exit={worstExit(row)}
          trigger={entryOf(latest, catalog)?.trigger}
        />
        {row.runs > 1 && <Burst count={row.runs} noun={["run", "runs"]} />}
        <TookInline row={row} />
      </span>
    );
  if (latest.kind === "access")
    return (
      <span className="ops-change">
        <HttpStatus status={worstStatus(row)} />
        {row.count > 1 && <Burst count={row.count} noun={["read", "reads"]} />}
        <TookInline row={row} />
      </span>
    );
  return latest.detail ? <DetailText>{latest.detail}</DetailText> : null;
}

/** How long it took: a read's latency (a burst's median) or a run's
 * duration. */
function Took({ row }: { row: Row }) {
  const { latest } = row;
  if (latest.kind === "access") {
    const values = row.events.flatMap((event) =>
      event.kind === "access" ? [event.ms] : [],
    );
    const low = Math.min(...values);
    const high = Math.max(...values);
    return (
      <span
        title={
          values.length > 1
            ? `Median of ${values.length}, ${low}ms to ${high}ms`
            : undefined
        }
      >
        <Duration ms={median(values)} />
      </span>
    );
  }
  if (latest.kind === "run") return <Duration ms={latest.ms} />;
  return null;
}

/** The device: the one that read, or the host the entry runs on. */
function deviceOf(event: OpsEvent, catalog: OpsCatalog) {
  if (event.kind === "access") return event.device;
  const entry = catalog.get(event.subject);
  if (!entry || entry.kind === "host") return null;
  const naming = entryNaming(entry);
  return naming.device ? entry.host : null;
}

function When({ row, now }: { row: Row; now?: number }) {
  return (
    <span
      title={
        row.count > 1
          ? `${row.count} events from ${new Date(row.earliest.at).toISOString().slice(11, 16)} to ${new Date(row.latest.at).toISOString().slice(11, 16)} UTC`
          : undefined
      }
    >
      <HourTime at={row.latest.at} now={now} />
    </span>
  );
}

function activityColumns(catalog: OpsCatalog, now?: number): Column<Row>[] {
  return [
    {
      key: "event",
      header: "Event",
      render: (row) => {
        const { latest } = row;
        const entry = entryOf(latest, catalog);
        const device = deviceOf(latest, catalog);
        // A phone row's second line says only what adds information: a
        // change of state, a failed run or read, or a burst's count.
        const informative =
          latest.kind === "transition" ||
          latest.kind === "other" ||
          row.count > 1 ||
          row.runs > 1 ||
          (latest.kind === "run" &&
            worstExit(row) !== 0 &&
            worstExit(row) !== null) ||
          (latest.kind === "access" && worstStatus(row) >= 300);
        const change = informative ? (
          <Change row={row} catalog={catalog} />
        ) : undefined;
        const common = {
          tooltip:
            latest.kind === "access"
              ? `${latest.subject}${latest.device ? `\n${deviceName(latest.device)}` : ""}`
              : latest.subject,
          mobile: change,
          end: (
            <>
              {device && <DeviceTile device={device} />}
              <HourTime at={latest.at} now={now} />
            </>
          ),
        };
        if (latest.kind === "access") {
          const route = routeMark(latest.subject);
          return (
            <RowTitle
              {...common}
              icon={route.icon}
              mark={route.mark ? <BrandTile id={route.mark} /> : undefined}
              kind="Reader access"
              title={opsRouteLabel(latest.subject)}
            />
          );
        }
        const naming = entryNaming(
          entry ?? { id: latest.subject, name: latest.subject },
        );
        return (
          <RowTitle
            {...common}
            mark={
              entry ? (
                <EntryTile naming={naming} />
              ) : (
                <BrandTile {...tileOf(latest.subject)} />
              )
            }
            kind={
              latest.kind === "other"
                ? humanize(latest.rawKind)
                : latest.kind === "run"
                  ? `Run, ${entry ? entryKind(entry, naming) : "not in the catalog"}`
                  : `Change, ${entry ? entryKind(entry, naming) : "not in the catalog"}`
            }
            title={entry ? naming.name : latest.subject}
            href={entry ? opsEntryHref(entry.id) : undefined}
          />
        );
      },
    },
    {
      key: "change",
      header: "Change",
      render: (row) => <Change row={row} catalog={catalog} />,
    },
    {
      key: "took",
      header: "Took",
      width: CELL_WIDTHS.figure,
      numeric: true,
      // Below large it rides in the Change cell, so Event and Change keep
      // the width.
      hideBelow: "large",
      render: (row) => <Took row={row} />,
    },
    {
      key: "device",
      header: <span className="sr-only">Device</span>,
      width: CELL_WIDTHS.tile,
      render: ({ latest }) => {
        const device = deviceOf(latest, catalog);
        return device ? (
          <DeviceTile device={device} />
        ) : (
          <span className="sr-only">No device</span>
        );
      },
    },
    {
      key: "at",
      header: "When",
      width: CELL_WIDTHS.time,
      render: (row) => <When row={row} now={now} />,
    },
  ];
}

function tileOf(subject: string) {
  const tile = opsMark({ id: subject });
  return { id: tile.id, kind: tile.kind };
}

function MenuCount({ value }: { value: number }) {
  return <span className="ops-menu-count workspace-figure">{value}</span>;
}

/** The one chip that shows plumbing: preflights, the reader's probe and
 * admin's own polling, left out by default. */
function PlumbingChip({
  count,
  shown,
  onToggle,
}: {
  count: number;
  shown: boolean;
  onToggle: () => void;
}) {
  const name = "Preflights, probes and admin polling";
  return (
    <button
      type="button"
      className="ops-chip-toggle"
      aria-pressed={shown}
      title={
        shown ? `Hide ${name.toLowerCase()}` : `Show ${name.toLowerCase()}`
      }
      onClick={onToggle}
    >
      <span>Polling</span>
      <span className="workspace-figure ops-chip-count">{count}</span>
    </button>
  );
}

export function ActivityView({ data }: { data: OpsData }) {
  const [source, setSource] = useState("all");
  const [plumbing, setPlumbing] = useState(false);
  const [limit, setLimit] = useState(ACTIVITY_STEP);
  const catalog = useMemo(() => catalogOf(data.snapshot), [data.snapshot]);
  const events = data.events?.recent;
  const hidden = useMemo(() => opsPlumbingCount(events ?? []), [events]);
  const rows = useMemo(
    () => opsActivityRows(events ?? [], { plumbing }),
    [events, plumbing],
  );
  const sourceOf = useMemo(() => {
    const cache = new Map<Row, { id: string; label: string }>();
    return (row: Row) => {
      let value = cache.get(row);
      if (!value) {
        value = opsActivitySource(row.latest, catalog);
        cache.set(row, value);
      }
      return value;
    };
  }, [catalog]);
  // Each source once, with its count, in name order.
  const sources = useMemo(() => {
    const seen = new Map<string, { label: string; count: number }>();
    for (const row of rows) {
      const { id, label } = sourceOf(row);
      const entry = seen.get(id) ?? { label, count: 0 };
      entry.count += 1;
      seen.set(id, entry);
    }
    return [...seen].sort((a, b) => a[1].label.localeCompare(b[1].label));
  }, [rows, sourceOf]);
  const columns = useMemo(
    () => activityColumns(catalog, data.fixedNow),
    [catalog, data.fixedNow],
  );
  const shown =
    source === "all" ? rows : rows.filter((row) => sourceOf(row).id === source);
  const visible = shown.slice(0, limit);
  const today = data.fixedNow;
  const choose = (next: string) => {
    setSource(next);
    setLimit(ACTIVITY_STEP);
  };
  return (
    <OpsPage
      data={data}
      view="activity"
      count={shown.length}
      retained
      actions={
        <>
          {hidden > 0 && (
            <PlumbingChip
              count={hidden}
              shown={plumbing}
              onToggle={() => {
                setPlumbing((value) => !value);
                setLimit(ACTIVITY_STEP);
              }}
            />
          )}
          <FilterMenu
            label="Source"
            icon={BroadcastIcon}
            value={
              source === "all"
                ? "All"
                : (sources.find(([id]) => id === source)?.[1].label ?? "Source")
            }
            isActive={source !== "all"}
          >
            <DropdownMenuRadioGroup
              label="Event source"
              value={source}
              onChange={choose}
            >
              <DropdownMenuRadioItem
                value="all"
                label="All sources"
                endContent={<MenuCount value={rows.length} />}
              />
              {sources.map(([id, { label, count }]) => (
                <DropdownMenuRadioItem
                  key={id}
                  value={id}
                  label={label}
                  endContent={<MenuCount value={count} />}
                />
              ))}
            </DropdownMenuRadioGroup>
          </FilterMenu>
        </>
      }
    >
      {visible.length ? (
        <VStack gap={4}>
          <DataTable
            rows={visible}
            columns={columns}
            rowKey="key"
            label="Activity, newest first"
            noun={["event", "events"]}
            footer={false}
            interactive={false}
            groupBy={(row) => row.day}
            groupLabel={(key) => <DayLabel day={key} now={today} />}
          />
          {shown.length > visible.length && (
            <Button
              label="Show more"
              size="sm"
              variant="secondary"
              onClick={() => setLimit((value) => value + ACTIVITY_STEP)}
            />
          )}
        </VStack>
      ) : (
        <StateNotice
          kind="empty"
          icon={ListBulletsIcon}
          title={rows.length ? "No events from this source" : "No events yet"}
          action={
            rows.length ? (
              <Button
                label="All sources"
                size="sm"
                onClick={() => choose("all")}
              />
            ) : undefined
          }
        />
      )}
    </OpsPage>
  );
}
