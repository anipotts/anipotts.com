/**
 * What Observability derives from System's ops_v1 snapshot and
 * ops_events_v1 feed before it draws anything: host facts, trigger and
 * cadence wording, each job's run history, Activity's rows with bursts
 * folded, and the synced apps with their freshness. Pure, so every view and
 * test reads the same values the same way. Nothing here invents a System
 * field: a value System does not send stays null and the view renders
 * without it.
 */
import { brandMark, type MarkId } from "@anipotts/brand/marks";
import {
  opsFreshness,
  opsIsHost,
  type OpsCatalogEntry,
  type OpsServiceView,
  type OpsState,
  type OpsStatusRow,
} from "./ops-v1";
import {
  opsIsPlumbing,
  worse,
  type OpsEvent,
  type OpsRunEvent,
} from "./ops-events";
import {
  SYNC_ARRIVAL_UNRECORDED,
  SYNC_JOBS,
  deviceName,
  opsNaming,
  syncedApps,
} from "./naming";
import {
  HEALTH_METRICS_ID,
  healthMetricsText,
  parseHealthMetrics,
} from "./health-metrics";
import { dayKey } from "../components/workspace/format";

// Details

/** What an entry's detail reads as: System's own text, health.metrics'
 * `missing:<list>` as words, and a word for an entry with no status row.
 * Status and Alerts read it the same way. */
export function opsDetailText(
  service: Pick<OpsServiceView, "id" | "missingStatus" | "status">,
): string {
  if (service.missingStatus) return "No status row from System";
  if (service.id === HEALTH_METRICS_ID)
    return (
      healthMetricsText(parseHealthMetrics(service.status.detail)) ??
      service.status.detail
    );
  return service.status.detail;
}

// Hosts

export type OpsHostFacts = {
  /** Disk use in percent: System's `disk_percent`, else read from the
   * detail ("disk 63% used"). */
  disk: number | null;
  /** Seconds since boot, when System sends `uptime_s`. */
  uptimeS: number | null;
  /** System's `awake`; an asleep host is not awake even without it. */
  awake: boolean | null;
  /** When the host was last sampled: a host row's last success. */
  sampledAt: string | null;
};

const DISK = /\bdisk (\d{1,3})% used\b/;

/** The disk figure in a host's detail ("disk 63% used"), or null. */
export function opsDetailDisk(detail: string): number | null {
  const read = DISK.exec(detail);
  const figure = read ? Number(read[1]) : null;
  return figure !== null && figure <= 100 ? figure : null;
}

export function opsHostFacts(service: {
  status: Pick<
    OpsStatusRow,
    | "state"
    | "detail"
    | "last_success_at"
    | "disk_percent"
    | "uptime_s"
    | "awake"
  >;
}): OpsHostFacts {
  const { status } = service;
  return {
    disk: status.disk_percent ?? opsDetailDisk(status.detail),
    uptimeS: status.uptime_s,
    awake: status.awake ?? (status.state === "asleep" ? false : null),
    sampledAt: status.last_success_at,
  };
}

// States

/** A restore drill that has never run proves nothing: System's
 * `never_run` detail reads as Unverified, never as ok, whatever the state. */
export function opsUnverified(service: {
  status: Pick<OpsStatusRow, "detail">;
}): boolean {
  return service.status.detail === "never_run";
}

// Triggers and cadence

/** System records no run events for a job that runs more often than this
 * (anipotts/system bin/ops-sampler); those runs would drown Activity. */
export const OPS_RUN_EVENTS_MIN_INTERVAL_S = 900;

/** Whether System records this job's runs one by one. */
export function opsRecordsRuns(status: Pick<OpsStatusRow, "interval_s">) {
  return (
    status.interval_s === null ||
    status.interval_s >= OPS_RUN_EVENTS_MIN_INTERVAL_S
  );
}

/** A launchd interval as people say it: "every 15 s", "every minute",
 * "every 10 min", "every hour", "every 4 h", "every day". */
export function opsCadenceText(seconds: number): string {
  if (seconds < 60) return `every ${seconds} s`;
  if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    return minutes === 1 ? "every minute" : `every ${minutes} min`;
  }
  if (seconds < 86_400) {
    const hours = seconds / 3600;
    if (!Number.isInteger(hours))
      return `every ${Math.round(seconds / 60)} min`;
    return hours === 1 ? "every hour" : `every ${hours} h`;
  }
  const days = Math.round(seconds / 86_400);
  return days === 1 ? "every day" : `every ${days} days`;
}

export type OpsTriggerFacts = {
  label: string;
  /** How often or when: "checks every 15m", "daily 04:30", "always
   * running". An interval is only how often launchd starts the job, which
   * is not always its cadence, so it reads as a check. A generic phrase
   * ("always running", "when its files change") stands only where the
   * catalog's schedule names no cadence of its own, so the trigger never
   * says what the schedule contradicts. */
  cadence: string | null;
  /** launchd does not expose an interval job's timer, so its next run is
   * the last run plus the interval. */
  approximate: boolean;
};

/** A launchd interval as a compact period: "15s", "15m", "1h", "4h",
 * "90m", "2d". */
export function opsPeriodText(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600 || seconds % 3600 !== 0)
    return seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`;
  if (seconds < 86_400 || seconds % 86_400 !== 0) return `${seconds / 3600}h`;
  return `${seconds / 86_400}d`;
}

const PERIOD_UNITS: Readonly<Record<string, number>> = {
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
  m: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  h: 3600,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
  d: 86_400,
  day: 86_400,
  days: 86_400,
};

/** The period a catalog schedule names, in seconds: "hourly" and "every
 * hour" are 3600, "every 15 min while awake" is 900. Null for a schedule
 * that names a time of day ("daily 04:00", "nightly after 03:00") or no
 * period at all. */
export function opsSchedulePeriod(schedule: string | null): number | null {
  const text = schedule?.trim().toLowerCase() ?? "";
  if (text === "hourly") return 3600;
  const every = /^every (?:(\d+) ?)?([a-z]+)\b/.exec(text);
  if (!every) return null;
  const unit = PERIOD_UNITS[every[2]!];
  if (unit === undefined) return null;
  return (every[1] ? Number(every[1]) : 1) * unit;
}

export type OpsNextRun = {
  at: string;
  /** An interval job's next run is its last run plus its interval. */
  approximate: boolean;
  /** Seconds past due that still read a quiet "due now". */
  graceS: number;
};

/**
 * What an entry's Next run may truthfully say, or null for nothing.
 *
 * An interval job whose schedule names a different cadence from its
 * interval ("nightly after 03:00" on an hourly interval) is only checked
 * that often, so a next run at or before the snapshot is not a run that is
 * due: it is unknown, and hidden. Lateness on an interval job reads "due
 * now" until it passes the entry's own freshness budget, and only then
 * overdue; a null budget is liveness only and never overdue. A calendar
 * time is exact, so it keeps a minute's grace.
 */
export function opsNextRun(
  service: Pick<
    OpsServiceView,
    "trigger" | "schedule" | "freshness_budget_s" | "sampledAt"
  > & { status: Pick<OpsStatusRow, "next_run_at" | "interval_s"> },
): OpsNextRun | null {
  const at = service.status.next_run_at;
  if (!at) return null;
  if (service.trigger !== "interval")
    return { at, approximate: false, graceS: 60 };
  const interval = service.status.interval_s;
  const cadence =
    interval !== null && opsSchedulePeriod(service.schedule) === interval;
  if (!cadence && Date.parse(at) <= Date.parse(service.sampledAt)) return null;
  return {
    at,
    approximate: true,
    graceS: service.freshness_budget_s ?? Number.POSITIVE_INFINITY,
  };
}

/** Whether a catalog schedule names a cadence, a period ("hourly", "every
 * 15 min") or a clock time ("daily 04:30"), which a generic trigger phrase
 * such as "always running" would contradict. "continuous" and "launchd"
 * name none. */
export function opsScheduleTimed(schedule: string | null): boolean {
  if (!schedule) return false;
  return (
    opsSchedulePeriod(schedule) !== null ||
    /\b\d{1,2}:\d{2}\b/.test(schedule) ||
    /\b(?:hourly|daily|nightly|weekly|monthly)\b/i.test(schedule)
  );
}

/** How launchd starts an entry, in words, or null when System names no
 * trigger. The wording comes from the entry's kind and schedule: a job that
 * launchd keeps alive (health.ingest, "when the phone pushes") runs when its
 * schedule says, not always. */
export function opsTriggerFacts(
  entry: Pick<OpsCatalogEntry, "trigger" | "schedule"> & {
    kind?: string | null;
  },
  status: Pick<OpsStatusRow, "interval_s">,
): OpsTriggerFacts | null {
  const schedule = entry.schedule?.trim() || null;
  switch (entry.trigger) {
    case "interval":
      return {
        label: "Interval",
        cadence:
          status.interval_s !== null
            ? `checks every ${opsPeriodText(status.interval_s)}`
            : schedule,
        approximate: true,
      };
    case "calendar":
      return { label: "Calendar", cadence: schedule, approximate: false };
    case "keepalive":
      // A service kept alive runs always, unless its schedule names a
      // cadence; a job kept alive runs when its schedule says.
      return {
        label: "Keepalive",
        cadence:
          entry.kind === "service" && !opsScheduleTimed(schedule)
            ? "always running"
            : schedule,
        approximate: false,
      };
    case "watch":
      return {
        label: "Watch",
        cadence: opsScheduleTimed(schedule)
          ? schedule
          : "when its files change",
        approximate: false,
      };
    case "manual":
      return { label: "Manual", cadence: schedule, approximate: false };
    case "sampled":
      return { label: "Sampled", cadence: schedule, approximate: false };
    default:
      return null;
  }
}

// Runs

export type OpsRun = {
  key: string;
  /** When the run finished, as System reports it. */
  at: string;
  exit: number | null;
  ms: number | null;
  /** launchd runs behind this one finish time: System reports the rise in
   * the run count, and a job that ran without a new receipt reports the
   * same finish time again. */
  runs: number;
  subject: string;
};

const RUN_COUNT = /^(\d{1,6}) run\(s\)$/;

/** How many launchd runs a run event stands for ("2 run(s)"), 1 when the
 * detail does not say. */
export function opsRunCount(event: Pick<OpsRunEvent, "detail">): number {
  const count = RUN_COUNT.exec(event.detail ?? "");
  return count ? Math.max(1, Number(count[1])) : 1;
}

/** Run events as runs: one per entry and finish time, newest first. System
 * can report one finish time more than once (launchd ran again without a
 * new receipt); those merge, their run counts added. */
export function opsRuns(events: readonly OpsRunEvent[]): OpsRun[] {
  const byRun = new Map<string, OpsRun & { seq: number }>();
  for (const event of events) {
    const key = `${event.subject}@${event.at}`;
    const seen = byRun.get(key);
    if (!seen) {
      byRun.set(key, {
        key,
        at: event.at,
        exit: event.exit,
        ms: event.ms,
        runs: opsRunCount(event),
        subject: event.subject,
        seq: event.seq,
      });
      continue;
    }
    seen.runs += opsRunCount(event);
    if (event.seq > seen.seq) {
      seen.seq = event.seq;
      seen.exit = event.exit ?? seen.exit;
      seen.ms = event.ms ?? seen.ms;
    }
  }
  return [...byRun.values()]
    .sort((a, b) => b.at.localeCompare(a.at) || b.seq - a.seq)
    .map(({ seq: _seq, ...run }) => run);
}

/** One entry's recent runs, newest first. */
export function opsRunHistory(
  events: readonly OpsRunEvent[],
  subject: string,
  limit = 20,
): OpsRun[] {
  return opsRuns(events.filter((event) => event.subject === subject)).slice(
    0,
    limit,
  );
}

// Activity

/** Consecutive events of one kind and subject closer than this fold into
 * one row. */
export const OPS_BURST_GAP_MS = 2 * 60_000;

export type OpsActivityRow = {
  key: string;
  /** Newest first. */
  events: OpsEvent[];
  latest: OpsEvent;
  earliest: OpsEvent;
  /** Events in the row; a merged run counts once per finish time. */
  count: number;
  /** For run rows: launchd runs behind the row. */
  runs: number;
  /** For a transition burst that came back to the state it left: the worst
   * state it reached on the way, and how many times it left. */
  via: OpsState | null;
  flaps: number;
  day: string;
} & Record<string, unknown>;

function burstKey(event: OpsEvent) {
  if (event.kind === "access")
    return `access:${event.subject}:${event.device ?? ""}`;
  if (event.kind === "other") return `other:${event.rawKind}:${event.subject}`;
  return `${event.kind}:${event.subject}`;
}

const time = (event: OpsEvent) => Date.parse(event.at);

/**
 * Activity's rows, newest first by the time each event happened (a run's
 * finish can arrive after later events). Plumbing (preflights, the probe,
 * admin's own polling) is left out unless asked for; a run reported twice
 * is one run; and consecutive events of one kind and subject (and device,
 * for reads) less than two minutes apart fold into one row with a count.
 */
export function opsActivityRows(
  events: readonly OpsEvent[],
  { plumbing = false }: { plumbing?: boolean } = {},
): OpsActivityRow[] {
  const seen = new Map<string, number>();
  const kept: OpsEvent[] = [];
  const runs = new Map<number, number>();
  for (const event of events) {
    if (!plumbing && opsIsPlumbing(event)) continue;
    if (event.kind === "run") {
      const key = `${event.subject}@${event.at}`;
      const first = seen.get(key);
      if (first !== undefined) {
        runs.set(first, (runs.get(first) ?? 1) + opsRunCount(event));
        continue;
      }
      seen.set(key, event.seq);
      runs.set(event.seq, opsRunCount(event));
    }
    kept.push(event);
  }
  kept.sort((a, b) => time(b) - time(a) || b.seq - a.seq);
  const rows: OpsActivityRow[] = [];
  for (const event of kept) {
    const day = dayKey(event.at);
    const last = rows.at(-1);
    if (
      last &&
      last.day === day &&
      burstKey(last.earliest) === burstKey(event) &&
      time(last.earliest) - time(event) < OPS_BURST_GAP_MS
    ) {
      last.events.push(event);
      last.earliest = event;
      last.count += 1;
      last.runs += runs.get(event.seq) ?? 0;
      continue;
    }
    rows.push({
      key: String(event.seq),
      events: [event],
      latest: event,
      earliest: event,
      count: 1,
      runs: runs.get(event.seq) ?? 0,
      via: null,
      flaps: 0,
      day,
    });
  }
  return rows.flatMap(settleTransitions);
}

/**
 * A transition burst keeps one row only when it can be told truthfully in
 * one: every change is the same pair ("OK to Degraded ×3"), or it came back
 * to where it started, when it shows the worst state it reached ("OK to
 * Degraded to OK ×2"), never "OK to OK". Anything else is one row per
 * change.
 */
function settleTransitions(row: OpsActivityRow): OpsActivityRow[] {
  const { earliest, latest } = row;
  if (
    row.count < 2 ||
    earliest.kind !== "transition" ||
    latest.kind !== "transition"
  )
    return [row];
  const changes = row.events.filter((event) => event.kind === "transition");
  if (new Set(changes.map((e) => `${e.from ?? ""}>${e.to}`)).size === 1)
    return [row];
  const start = earliest.from;
  if (start !== null && start === latest.to) {
    const away = changes.map((event) => event.to).filter((to) => to !== start);
    if (!away.length) return [row];
    const via = away.reduce(worse, away.at(-1)!);
    return [
      {
        ...row,
        via,
        flaps: changes.filter((event) => event.from === start).length,
      },
    ];
  }
  return row.events.map((event) => ({
    ...row,
    key: String(event.seq),
    events: [event],
    latest: event,
    earliest: event,
    count: 1,
  }));
}

/** How many events the default Activity view leaves out as plumbing. */
export function opsPlumbingCount(events: readonly OpsEvent[]): number {
  return events.filter(opsIsPlumbing).length;
}

// Syncs

export type OpsSyncRow = {
  key: string;
  /** The synced app, or null for a sync shown as its own job. */
  app: MarkId | null;
  service: OpsServiceView;
} & Record<string, unknown>;

/** Every synced app the catalog carries, one row per app and sync, by the
 * app's name so an app two syncs carry sits together, then in the
 * catalog's display order. A multi-app pass (SYNC_JOBS) is one row of its
 * own, after the apps. */
export function opsSyncRows(services: readonly OpsServiceView[]): OpsSyncRow[] {
  const label = (app: MarkId | null) =>
    app === null ? "" : (brandMark(app)?.label ?? app);
  return services
    .filter((service) => !opsIsHost(service))
    .flatMap((service, index): Array<OpsSyncRow & { index: number }> =>
      SYNC_JOBS.includes(service.id)
        ? [{ key: `${service.id}:job`, app: null, service, index }]
        : (syncedApps(service.id) ?? []).map((app) => ({
            key: `${service.id}:${app}`,
            app,
            service,
            index,
          })),
    )
    .sort(
      (a, b) =>
        Number(a.app === null) - Number(b.app === null) ||
        label(a.app).localeCompare(label(b.app)) ||
        a.index - b.index,
    )
    .map(({ index: _index, ...row }) => row);
}

/**
 * What a sync shows for its state (A-10). The row's own state comes first: a
 * sync whose row is failing, degraded, stale, asleep or unknown shows that
 * state whatever the age of its last success, an entry with no status row is
 * unknown, and a restore never proven is Unverified. Only an ok row is judged
 * against its own budget, fresh or stale; a null budget cannot be judged
 * however old the last success, and an ok row with no success recorded has
 * nothing to judge yet. An ok sync whose success time is not an arrival
 * (health.ingest, A-38) is withheld: no age, no freshness.
 */
export type OpsSyncState =
  | { kind: "state"; state: Exclude<OpsState, "ok"> }
  | { kind: "unverified" }
  | { kind: "fresh" }
  | { kind: "stale" }
  | { kind: "unjudged" }
  | { kind: "unrecorded" }
  | { kind: "withheld" };

/** Whether an entry's success and run times are withheld wherever they
 * render (A-38): they are a file's time, not an arrival
 * (SYNC_ARRIVAL_UNRECORDED). Its state and detail stay System's. */
export function opsSyncWithheld(service: Pick<OpsServiceView, "id">): boolean {
  return SYNC_ARRIVAL_UNRECORDED.includes(service.id);
}

export function opsSyncState(
  service: OpsServiceView,
  now: number,
): OpsSyncState {
  if (service.missingStatus) return { kind: "state", state: "unknown" };
  if (opsUnverified(service)) return { kind: "unverified" };
  const { state } = service.status;
  if (state !== "ok") return { kind: "state", state };
  if (opsSyncWithheld(service)) return { kind: "withheld" };
  if (service.freshness_budget_s === null) return { kind: "unjudged" };
  const freshness = opsFreshness(service, now);
  if (freshness.kind !== "budget") return { kind: "unrecorded" };
  return { kind: freshness.overBudget ? "stale" : "fresh" };
}

// Names

/**
 * Short names two catalog entries would share once their device word goes
 * ("session transcripts to R2" on ap-mini and "pro session transcripts to
 * R2" on ap-pro both read "Session transcripts to R2"), with their host
 * after a comma so every row names itself: "Session transcripts to R2,
 * ap-mini". Entries whose names are their own keep them, and are absent.
 */
export function opsDistinctNames(
  catalog: readonly Pick<OpsCatalogEntry, "id" | "name" | "kind" | "host">[],
): ReadonlyMap<string, string> {
  const named = catalog.map((entry) => ({
    entry,
    name: opsNaming(entry).name,
  }));
  const counts = new Map<string, number>();
  for (const { name } of named)
    counts.set(name.toLowerCase(), (counts.get(name.toLowerCase()) ?? 0) + 1);
  return new Map(
    named
      .filter(({ name }) => (counts.get(name.toLowerCase()) ?? 0) > 1)
      .map(({ entry, name }) => [
        entry.id,
        `${name}, ${deviceName(entry.host)}`,
      ]),
  );
}
