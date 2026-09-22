import React, { useEffect, useMemo, useState } from "react";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import {
  ArrowClockwiseIcon,
  CalendarDotsIcon,
  HeartbeatIcon,
  MoonIcon,
  PlugsIcon,
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
import { useLiveText } from "../../lib/live-clock";
import { BrandTile } from "../BrandTile";
import {
  CELL_WIDTHS,
  DataTable,
  FilterMenu,
  LoadingSkeleton,
  RelativeTime,
  RowTitle,
  SampleBadge,
  StateNotice,
  WorkspacePage,
  type Column,
} from "../workspace/Workspace";
import { dayKey, dayLabel, durationText } from "../workspace/format";
import { DataSessionControl, SessionNotice } from "./DataNotices";
import { useDataSession } from "./useDataSession";
import "./data-workspace.css";
import "./health.css";

/**
 * Data Health: System's daily summary, stored values only. The header says
 * when the phone last synced (once System serves it) and how many days hold
 * a reading; then one row per day. A reading System does not have is never
 * drawn as a number: a metric with no reading in the range has no column,
 * and when no vital has one the header says "No vitals collected".
 *
 * Off (PRIVATE_READER_HEALTH_ENABLED unset, as in production), the view is
 * one "not connected" notice and makes no request. On, it reads through its
 * own health:read session (lib/private-reader-health.ts), memory only.
 */

type Metric = {
  key: keyof Omit<HealthDay, "date">;
  header: string;
  /** The phone's glyph, with the header's name for assistive technology. */
  icon: Icon;
  /** Shown only from `large` up. */
  wide?: true;
  /** A vital, as opposed to activity. */
  vital: boolean;
  format: (value: number) => string;
};

const ONE_DECIMAL = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});
const WHOLE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const METRICS: readonly Metric[] = [
  {
    key: "steps",
    header: "Steps",
    icon: SneakerMoveIcon,
    vital: false,
    format: (value) => WHOLE.format(value),
  },
  {
    key: "sleepHours",
    header: "Sleep",
    icon: MoonIcon,
    vital: true,
    format: (value) => durationText(Math.round(value * 60) * 60_000) ?? "",
  },
  {
    key: "restingHeartRate",
    header: "Resting HR",
    icon: HeartbeatIcon,
    vital: true,
    format: (value) => `${ONE_DECIMAL.format(value)} bpm`,
  },
  {
    key: "hrv",
    header: "HRV",
    icon: HeartbeatIcon,
    wide: true,
    vital: true,
    format: (value) => `${ONE_DECIMAL.format(value)} ms`,
  },
  {
    key: "weightLbs",
    header: "Weight",
    icon: HeartbeatIcon,
    wide: true,
    vital: true,
    format: (value) => `${ONE_DECIMAL.format(value)} lb`,
  },
];

/** The metrics with at least one reading in these days. */
export function presentMetrics(items: readonly HealthDay[]): Metric[] {
  return METRICS.filter((metric) =>
    items.some((item) => item[metric.key] !== null),
  );
}

/** Days holding at least one reading. */
export function coveredDays(items: readonly HealthDay[]): HealthDay[] {
  return items.filter((item) => METRICS.some((m) => item[m.key] !== null));
}

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

/** The header's line: last phone sync, days covered, and no vitals. */
function HealthMeta({ data }: { data: HealthDaily }) {
  const covered = coveredDays(data.items);
  const vitals = presentMetrics(data.items).some((metric) => metric.vital);
  const newest = covered[0]?.date;
  const oldest = covered.at(-1)?.date;
  return (
    <span className="health-meta">
      {data.lastPushAt && (
        <span className="health-meta-item">
          <BrandTile id="ap-phone" kind="device" size={20} label="ap-phone" />
          <span>Last phone sync</span>
          <RelativeTime value={data.lastPushAt} />
        </span>
      )}
      {covered.length > 0 && newest && oldest && (
        <span
          className="health-meta-item"
          title={`${dateText(oldest)} to ${dateText(newest)}`}
        >
          <CalendarDotsIcon weight="regular" aria-hidden="true" />
          <span>
            {covered.length} {covered.length === 1 ? "day" : "days"}
          </span>
        </span>
      )}
      {!vitals && (
        <span className="health-meta-item">
          <HeartbeatIcon weight="regular" aria-hidden="true" />
          <span>No vitals collected</span>
        </span>
      )}
    </span>
  );
}

type Row = HealthDay & { label: string } & Record<string, unknown>;

/** A reading in its column: the stored value, or plainly none. */
function Reading({ metric, row }: { metric: Metric; row: Row }) {
  const value = row[metric.key];
  if (value === null) return <span className="health-none">Not collected</span>;
  return <span className="workspace-figure">{metric.format(value)}</span>;
}

/** A phone row's figures: fixed slots so the days line up in columns. */
function PhoneReadings({ metrics, row }: { metrics: Metric[]; row: Row }) {
  return (
    <span className="health-phone">
      {metrics
        .filter((metric) => !metric.wide)
        .map((metric) => {
          const value = row[metric.key];
          const Glyph = metric.icon;
          return (
            <span
              key={metric.key}
              className="health-phone-slot"
              title={metric.header}
            >
              {value === null ? (
                <span className="sr-only">{metric.header} not collected</span>
              ) : (
                <>
                  <Glyph weight="regular" aria-hidden="true" />
                  <span className="sr-only">{metric.header} </span>
                  {metric.format(value)}
                </>
              )}
            </span>
          );
        })}
    </span>
  );
}

function HealthTable({ data }: { data: HealthDaily }) {
  const today = useLiveText((now) => dayKey(now), Date.now());
  const metrics = presentMetrics(data.items);
  const rows = useMemo(
    () =>
      coveredDays(data.items).map(
        (item) =>
          ({
            ...item,
            label: dayLabel(item.date, Date.parse(`${today}T12:00:00`)),
          }) as Row,
      ),
    [data.items, today],
  );
  if (!rows.length)
    return <StateNotice kind="empty" title="No vitals collected" />;
  const columns: Column<Row>[] = [
    {
      key: "day",
      header: "Day",
      render: (row) => (
        <RowTitle
          kind="Day"
          title={row.label}
          tooltip={row.date}
          end={<PhoneReadings metrics={metrics} row={row} />}
        />
      ),
    },
    ...metrics.map((metric): Column<Row> => ({
      key: metric.key,
      header: metric.header,
      width: CELL_WIDTHS.time,
      numeric: true,
      hideBelow: metric.wide ? "large" : undefined,
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
function FixtureHealth({ fixture }: { fixture: unknown }) {
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
      meta={read.status === "ready" ? <HealthMeta data={read.data} /> : null}
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
}: {
  session?: PrivateReaderSession;
  fetch?: typeof fetch;
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
      meta={shown ? <HealthMeta data={shown} /> : null}
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
}: {
  /** PRIVATE_READER_ENABLED and PRIVATE_READER_HEALTH_ENABLED are both
   * exactly "true" on the server. */
  enabled: boolean;
  /** Development only: System's reply shape, synthetic. */
  fixture?: unknown;
  session?: PrivateReaderSession;
  fetch?: typeof fetch;
}) {
  if (fixture !== undefined) return <FixtureHealth fixture={fixture} />;
  if (!enabled)
    return (
      <Page>
        <StateNotice
          kind="not-connected"
          icon={PlugsIcon}
          title="Health not connected"
        />
      </Page>
    );
  return <LiveHealth session={session} fetch={fetcher} />;
}
