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
  type OpsStatusRow,
} from "./ops-v1";
import { opsIsPlumbing, type OpsEvent, type OpsRunEvent } from "./ops-events";
import { syncedApps } from "./naming";
import { dayKey } from "../components/workspace/format";

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
  /** How often or when: "every 15 min", "daily 04:30", "always running". */
  cadence: string | null;
  /** launchd does not expose an interval job's timer, so its next run is
   * the last run plus the interval. */
  approximate: boolean;
};

/** How launchd starts an entry, in words, or null when System names no
 * trigger. */
export function opsTriggerFacts(
  entry: Pick<OpsCatalogEntry, "trigger" | "schedule">,
  status: Pick<OpsStatusRow, "interval_s">,
): OpsTriggerFacts | null {
  switch (entry.trigger) {
    case "interval":
      return {
        label: "Interval",
        cadence:
          status.interval_s !== null
            ? opsCadenceText(status.interval_s)
            : entry.schedule,
        approximate: true,
      };
    case "calendar":
      return { label: "Calendar", cadence: entry.schedule, approximate: false };
    case "keepalive":
      return {
        label: "Keepalive",
        cadence: "always running",
        approximate: false,
      };
    case "watch":
      return {
        label: "Watch",
        cadence: "when its files change",
        approximate: false,
      };
    case "manual":
      return { label: "Manual", cadence: entry.schedule, approximate: false };
    case "sampled":
      return { label: "Sampled", cadence: entry.schedule, approximate: false };
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
      day,
    });
  }
  return rows;
}

/** How many events the default Activity view leaves out as plumbing. */
export function opsPlumbingCount(events: readonly OpsEvent[]): number {
  return events.filter(opsIsPlumbing).length;
}

// Syncs

export type OpsSyncRow = {
  key: string;
  app: MarkId;
  service: OpsServiceView;
} & Record<string, unknown>;

/** Every synced app the catalog carries, one row per app and sync, by the
 * app's name so an app two syncs carry sits together, then in the
 * catalog's display order. */
export function opsSyncRows(services: readonly OpsServiceView[]): OpsSyncRow[] {
  const label = (app: MarkId) => brandMark(app)?.label ?? app;
  return services
    .filter((service) => !opsIsHost(service))
    .flatMap((service, index) =>
      (syncedApps(service.id) ?? []).map((app) => ({
        key: `${service.id}:${app}`,
        app,
        service,
        index,
      })),
    )
    .sort(
      (a, b) => label(a.app).localeCompare(label(b.app)) || a.index - b.index,
    )
    .map(({ index: _index, ...row }) => row);
}

/** A sync's freshness against its own budget. A null budget cannot be
 * judged, however old the last success or whether there is one; with a
 * budget and no success recorded, there is nothing to judge yet. */
export type OpsSyncFreshness = "fresh" | "stale" | "unjudged" | "never";

export function opsSyncFreshness(
  service: OpsServiceView,
  now: number,
): OpsSyncFreshness {
  if (service.freshness_budget_s === null) return "unjudged";
  const freshness = opsFreshness(service, now);
  if (freshness.kind !== "budget") return "never";
  return freshness.overBudget ? "stale" : "fresh";
}
