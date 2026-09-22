import React, { useEffect, useMemo, useState } from "react";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import {
  ArrowClockwiseIcon,
  CalendarDotsIcon,
  HeartbeatIcon,
  SneakerMoveIcon,
  type Icon,
} from "@phosphor-icons/react";
import { Button } from "@astryxdesign/core/Button";
import type { PrivateReaderSession } from "../../lib/private-reader-client";
import { PrivateReaderError } from "../../lib/private-reader-fetch";
import {
  HEALTH_DEFAULT_RANGE,
  HEALTH_RANGES,
  HealthDailyError,
  parseHealthDaily,
  readHealthDaily,
  sharedHealthSession,
  type HealthDaily,
  type HealthDay,
  type HealthRange,
} from "../../lib/private-reader-health";
import {
  HEALTH_METRIC_LABELS,
  HEALTH_METRICS_ID,
  healthMetricsCheck,
  type HealthMetricName,
} from "../../lib/health-metrics";
import { useLiveText } from "../../lib/live-clock";
import { useOpsData, type OpsViewProps } from "../observability/frame";
import { BrandTile } from "../BrandTile";
import {
  CELL_WIDTHS,
  DataTable,
  FilterMenu,
  LoadingSkeleton,
  RowTitle,
  SampleBadge,
  StateNotice,
  WorkspacePage,
  type Column,
} from "../workspace/Workspace";
import { dayKey, dayLabel } from "../workspace/format";
import { DataSessionControl, SessionNotice } from "./DataNotices";
import { useDataSession } from "./useDataSession";
import "./data-workspace.css";
import "./health.css";

/**
 * Data Health: only what really arrived. The header says the last phone
 * sync is not recorded (System has no arrival marker yet), which expected
 * metrics have not arrived or that the check is not current (health.metrics
 * in the ops snapshot, lib/health-metrics.ts), and how many days of the
 * range hold a reading; then one row per day of the range, "Nothing
 * arrived" where none did.
 *
 * A metric shows only once a collector feeds it. Steps come from the phone's
 * export today; weight joins once System's Withings collector writes real
 * values. Sleep, heart rate and HRV have no collector, so they always read
 * "No vitals collected", whatever the feed carries: the numbers once there
 * were seeded, never measured.
 *
 * Off (PRIVATE_READER_HEALTH_ENABLED unset, as in production), the view is
 * "No vitals collected", the withheld phone sync and the metric check from
 * ops, and makes no health request. On, it reads through its own health:read session
 * (lib/private-reader-health.ts), memory only.
 */

type Metric = {
  key: keyof Omit<HealthDay, "date">;
  header: string;
  /** The phone's glyph, with the header's name for assistive technology. */
  icon: Icon;
  format: (value: number) => string;
};

const WHOLE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** The metrics a collector feeds. Nothing else in the feed is drawn. Add
 * weight here once System's Withings collector writes real values. */
const COLLECTED: readonly Metric[] = [
  {
    key: "steps",
    header: "Steps",
    icon: SneakerMoveIcon,
    format: (value) => WHOLE.format(value),
  },
];

/** Whether a day holds a reading from a collected metric. */
const arrived = (item: HealthDay) =>
  COLLECTED.some((metric) => item[metric.key] !== null);

/** The days of the range, newest first, ending at the reply's own day in
 * Eastern Time, each with what System has for it (or nothing). */
export function rangeDays(
  data: Pick<HealthDaily, "days" | "items" | "observedAt">,
): Array<{ date: string; item: HealthDay | null }> {
  const byDate = new Map(data.items.map((item) => [item.date, item]));
  const end = EASTERN_DATE.format(Date.parse(data.observedAt));
  const [y, m, d] = end.split("-").map(Number) as [number, number, number];
  return Array.from({ length: data.days }, (_, index) => {
    const date = new Date(Date.UTC(y, m - 1, d - index))
      .toISOString()
      .slice(0, 10);
    return { date, item: byDate.get(date) ?? null };
  });
}

/** The days of the range that hold a collected reading. */
export function arrivedDays(items: readonly HealthDay[]): HealthDay[] {
  return items.filter(arrived);
}

const EASTERN_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

type Read =
  | { status: "loading" }
  | { status: "ready"; data: HealthDaily }
  | { status: "failed"; title: string };

function failureTitle(error: unknown): string {
  if (error instanceof HealthDailyError) return "Unreadable response";
  if (error instanceof PrivateReaderError) {
    if (error.failure === "forbidden" || error.failure === "unauthorized")
      return "Access refused";
    if (error.failure === "malformed") return "Unreadable response";
  }
  return "ap-mini unreachable";
}

const RANGE_LABELS: Record<HealthRange, string> = {
  7: "7 days",
  30: "30 days",
  90: "90 days",
};

const DATE_RANGE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const dateText = (date: string) => DATE_RANGE.format(Date.parse(date));

/** The glyph for a metric health.metrics names, where the table has one. */
const METRIC_GLYPHS: Partial<Record<HealthMetricName, Icon>> = {
  steps: SneakerMoveIcon,
  weight: HeartbeatIcon,
};

/**
 * The last phone sync, withheld: System's only time today is the export
 * file's modification time (lib/health-metrics.ts), which is not a phone's
 * arrival, so it reads "Not recorded" until System serves a real one.
 */
function PhoneSync() {
  return (
    <span className="health-meta-item">
      <BrandTile id="ap-phone" kind="device" size={20} label="ap-phone" />
      <span>Last phone sync</span>
      <span className="health-none">Not recorded</span>
    </span>
  );
}

/**
 * What health.metrics says: each expected metric that has not arrived in
 * the last 24 hours, or that the check is not current. Nothing when every
 * metric arrived or System lists no such check. Read from the ops snapshot
 * (the ops reader's gate, or the development fixture).
 */
function MetricsCheck({ ops }: { ops: OpsViewProps }) {
  const { snapshot, stopped } = useOpsData(ops, false);
  const check = snapshot ? healthMetricsCheck(snapshot, stopped) : null;
  if (!check || check.kind === "ok") return null;
  if (check.kind === "not_checked")
    return (
      <span className="health-meta-item" title={HEALTH_METRICS_ID}>
        <CalendarDotsIcon weight="regular" aria-hidden="true" />
        <span>Metric arrivals</span>
        <span className="health-none">Not checked</span>
      </span>
    );
  return (
    <>
      {check.metrics.map((name) => {
        const Glyph = METRIC_GLYPHS[name] ?? CalendarDotsIcon;
        return (
          <span
            key={name}
            className="health-meta-item"
            title={HEALTH_METRICS_ID}
          >
            <Glyph weight="regular" aria-hidden="true" />
            <span>
              {HEALTH_METRIC_LABELS[name]} not arrived in the last 24h
            </span>
          </span>
        );
      })}
    </>
  );
}

const opsReadable = (ops?: OpsViewProps): ops is OpsViewProps =>
  Boolean(ops && (ops.enabled || ops.fixture !== undefined));

/** The collection facts every Health view leads with: the withheld phone
 * sync, then what the per-metric check says, when ops can be read. */
function CollectionFacts({ ops }: { ops?: OpsViewProps }) {
  return (
    <>
      <PhoneSync />
      {opsReadable(ops) && <MetricsCheck ops={ops} />}
    </>
  );
}

/** The header's line: the last phone sync and what has not arrived (from
 * ops), how many days of the range hold a reading, and no vitals. */
function HealthMeta({ data, ops }: { data: HealthDaily; ops?: OpsViewProps }) {
  const covered = arrivedDays(data.items).length;
  const days = rangeDays(data);
  const newest = days[0]?.date;
  const oldest = days.at(-1)?.date;
  return (
    <span className="health-meta">
      <CollectionFacts ops={ops} />
      {newest && oldest && (
        <span
          className="health-meta-item"
          title={`${dateText(oldest)} to ${dateText(newest)}`}
        >
          <CalendarDotsIcon weight="regular" aria-hidden="true" />
          <span>
            {covered} of {data.days} days
          </span>
        </span>
      )}
      <NoVitals />
    </span>
  );
}

function NoVitals() {
  return (
    <span className="health-meta-item">
      <HeartbeatIcon weight="regular" aria-hidden="true" />
      <span>No vitals collected</span>
    </span>
  );
}

type Row = { date: string; label: string; item: HealthDay | null } & Record<
  string,
  unknown
>;

/** A reading in its column: the stored value, or plainly nothing. */
function Reading({ metric, row }: { metric: Metric; row: Row }) {
  const value = row.item?.[metric.key] ?? null;
  if (value === null)
    return <span className="health-none">Nothing arrived</span>;
  return <span className="workspace-figure">{metric.format(value)}</span>;
}

/** A phone row's figures: fixed slots, the glyph at a fixed place and the
 * figure right-aligned in a fixed width, so glyphs and figures each form a
 * column down the days whatever the figure's length. */
function PhoneReadings({ row }: { row: Row }) {
  if (!row.item || !arrived(row.item))
    return <span className="health-none">Nothing arrived</span>;
  return (
    <span className="health-phone">
      {COLLECTED.map((metric) => {
        const value = row.item![metric.key];
        const Glyph = metric.icon;
        return (
          <span
            key={metric.key}
            className="health-phone-slot"
            title={metric.header}
          >
            {value === null ? (
              <span className="sr-only">{metric.header}: nothing arrived</span>
            ) : (
              <>
                <Glyph weight="regular" aria-hidden="true" />
                <span className="health-phone-figure">
                  <span className="sr-only">{metric.header} </span>
                  {metric.format(value)}
                </span>
              </>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** Every day of the range, newest first; a day System has nothing for
 * reads "Nothing arrived", never a zero or a dash. */
function HealthTable({ data }: { data: HealthDaily }) {
  const today = useLiveText((now) => dayKey(now), Date.now());
  const rows = useMemo(
    () =>
      rangeDays(data).map(
        ({ date, item }) =>
          ({
            date,
            item,
            label: dayLabel(date, Date.parse(`${today}T12:00:00`)),
          }) as Row,
      ),
    [data, today],
  );
  const columns: Column<Row>[] = [
    {
      key: "day",
      header: "Day",
      render: (row) => (
        <RowTitle
          kind="Day"
          title={row.label}
          tooltip={row.date}
          end={<PhoneReadings row={row} />}
        />
      ),
    },
    ...COLLECTED.map((metric): Column<Row> => ({
      key: metric.key,
      header: metric.header,
      // Wide enough for "Nothing arrived" as well as the figure.
      width: CELL_WIDTHS.state,
      numeric: true,
      render: (row) => <Reading metric={metric} row={row} />,
    })),
  ];
  return (
    <div className="health-table">
      <DataTable
        rows={rows}
        rowKey="date"
        label="Health by day"
        noun={["day", "days"]}
        footer={false}
        interactive={false}
        columns={columns}
      />
    </div>
  );
}

/** The synthetic development summary, answered as the reader would for the
 * range and read through the same strict parser. */
function fixtureRead(fixture: unknown, days: number): HealthDaily {
  const envelope = (fixture ?? {}) as {
    data?: { items?: unknown[] };
  } & Record<string, unknown>;
  return parseHealthDaily(
    {
      ...envelope,
      data: {
        ...envelope.data,
        days,
        items: (envelope.data?.items ?? []).slice(0, days),
      },
    },
    days,
  );
}

function RangeMenu({
  range,
  onChange,
}: {
  range: HealthRange;
  onChange: (range: HealthRange) => void;
}) {
  return (
    <FilterMenu
      label="Range"
      icon={CalendarDotsIcon}
      value={RANGE_LABELS[range]}
      isActive={range !== HEALTH_DEFAULT_RANGE}
    >
      <DropdownMenuRadioGroup
        label="Range"
        value={String(range)}
        onChange={(next) => {
          const days = Number(next);
          if ((HEALTH_RANGES as readonly number[]).includes(days))
            onChange(days as HealthRange);
        }}
      >
        {HEALTH_RANGES.map((days) => (
          <DropdownMenuRadioItem
            key={days}
            value={String(days)}
            label={RANGE_LABELS[days]}
          />
        ))}
      </DropdownMenuRadioGroup>
    </FilterMenu>
  );
}

function Page({
  badge,
  actions,
  meta,
  children,
}: {
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="data-workspace health-view" data-view="health">
      <WorkspacePage title="Health" badge={badge} actions={actions} meta={meta}>
        {children}
      </WorkspacePage>
    </div>
  );
}

/** Development: the synthetic summary, no session. */
function FixtureHealth({
  fixture,
  ops,
}: {
  fixture: unknown;
  ops?: OpsViewProps;
}) {
  const [range, setRange] = useState<HealthRange>(HEALTH_DEFAULT_RANGE);
  const read = useMemo((): Read => {
    try {
      return { status: "ready", data: fixtureRead(fixture, range) };
    } catch (error) {
      return { status: "failed", title: failureTitle(error) };
    }
  }, [fixture, range]);
  return (
    <Page
      badge={<SampleBadge />}
      meta={
        read.status === "ready" ? (
          <HealthMeta data={read.data} ops={ops} />
        ) : null
      }
      actions={<RangeMenu range={range} onChange={setRange} />}
    >
      {read.status === "ready" ? (
        <HealthTable data={read.data} />
      ) : (
        <StateNotice kind="error" title="Unreadable response" />
      )}
    </Page>
  );
}

/** Production: the health:read session, read once per range. */
function LiveHealth({
  session: injected,
  fetch: fetcher,
  ops,
}: {
  session?: PrivateReaderSession;
  fetch?: typeof fetch;
  ops?: OpsViewProps;
}) {
  const [health] = useState<PrivateReaderSession | null>(
    () =>
      injected ??
      (typeof window === "undefined" ? null : sharedHealthSession()),
  );
  const session = useDataSession({
    enabled: true,
    session: health ?? undefined,
    fetch: fetcher,
  });
  const [range, setRange] = useState<HealthRange>(HEALTH_DEFAULT_RANGE);
  const [read, setRead] = useState<Read>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const ready = session.status === "ready" && health !== null;
  useEffect(() => {
    if (!ready || !health) return;
    const controller = new AbortController();
    setRead({ status: "loading" });
    readHealthDaily(health, range, {
      fetch: fetcher,
      signal: controller.signal,
    }).then(
      (data) => {
        if (!controller.signal.aborted) setRead({ status: "ready", data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setRead({ status: "failed", title: failureTitle(error) });
      },
    );
    return () => controller.abort();
  }, [ready, health, range, fetcher, session.generation, attempt]);
  // Readings never outlive the session that read them.
  const shown = ready && read.status === "ready" ? read.data : null;
  let body: React.ReactNode;
  if (!ready) body = <SessionNotice session={session} label="health" />;
  else if (read.status === "loading")
    body = <LoadingSkeleton label="health" columns={4} />;
  else if (read.status === "failed")
    body = (
      <StateNotice
        kind="error"
        title={read.title}
        action={
          <Button
            label="Try again"
            size="sm"
            variant="secondary"
            icon={<ArrowClockwiseIcon weight="regular" aria-hidden="true" />}
            onClick={() => setAttempt((count) => count + 1)}
          />
        }
      />
    );
  else body = <HealthTable data={read.data} />;
  return (
    <Page
      meta={shown ? <HealthMeta data={shown} ops={ops} /> : null}
      actions={
        <>
          {ready && <RangeMenu range={range} onChange={setRange} />}
          <DataSessionControl session={session} />
        </>
      }
    >
      {body}
    </Page>
  );
}

export function HealthView({
  enabled,
  fixture,
  session,
  fetch: fetcher,
  ops,
}: {
  /** PRIVATE_READER_ENABLED and PRIVATE_READER_HEALTH_ENABLED are both
   * exactly "true" on the server. */
  enabled: boolean;
  /** Development only: System's reply shape, synthetic. */
  fixture?: unknown;
  session?: PrivateReaderSession;
  fetch?: typeof fetch;
  /** The ops reader's gate and fixtures, for health.ingest and
   * health.metrics. */
  ops?: OpsViewProps;
}) {
  if (fixture !== undefined)
    return <FixtureHealth fixture={fixture} ops={ops} />;
  // Off: nothing is read. What is true is that no vitals are collected,
  // no phone sync is recorded, and what the metric check says; never a
  // number.
  if (!enabled)
    return (
      <Page
        meta={
          <span className="health-meta">
            <CollectionFacts ops={ops} />
          </span>
        }
      >
        <StateNotice
          kind="empty"
          icon={HeartbeatIcon}
          title="No vitals collected"
        />
      </Page>
    );
  return <LiveHealth session={session} fetch={fetcher} ops={ops} />;
}
