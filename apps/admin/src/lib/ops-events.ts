import {
  OPS_V1_BOUNDS,
  OPS_V1_STATES,
  OpsSnapshotError,
  exact,
  integer,
  known,
  type FieldDrift,
  member,
  text,
  timestamp,
  type OpsCatalogEntry,
  type OpsState,
} from "./ops-v1";

/**
 * System's `ops_events_v1` feed (`GET /v1/ops/events?after=&limit=`, scope
 * `ops:read`), parsed strictly. Contract: anipotts/system `docs/ops-v1.md`.
 *
 * Every item carries the nine keys, plus an optional `device`. A key this
 * client does not know is never read; its name goes to `unknownFields` for a
 * drift notice, and the page keeps working. `transition` rows name a catalog id
 * and the state it moved to; `run` rows name a catalog id with the run's exit
 * code in `status` and its duration in `ms` (either may be null); `access`
 * rows name a reader route family with an HTTP status and latency and never
 * carry query text, ids or identity. A kind this
 * client does not know is kept as `other` and rendered generically, since
 * System adds sources (deploys, proof) without a website deploy. A malformed
 * item rejects the whole page, the same as a malformed snapshot.
 */
export const OPS_EVENTS_VERSION = "ops_events_v1";
export const OPS_EVENTS_PATH = "/v1/ops/events";
export const OPS_EVENTS_BOUNDS = {
  /** 500 items of at most ~400 bytes each, with headroom. */
  maxBytes: 512 * 1024,
  maxLimit: 500,
  maxSeq: 10_000_000_000,
  /** One hour. A slower reader response is not a latency. */
  maxMs: 60 * 60 * 1000,
  /** A run can take as long as a freshness budget allows: a year. */
  maxRunMs: OPS_V1_BOUNDS.budgetMaxSeconds * 1000,
  kind: /^[a-z][a-z0-9_.-]{0,31}$/,
  route: /^[a-z][a-z0-9_.]{0,39}$/,
  subjectMax: 64,
  detailMax: OPS_V1_BOUNDS.detailMax,
} as const;

/** Pages read per poll, so a first read after a long gap still finishes. */
export const OPS_EVENTS_PAGES_PER_READ = 10;
/** Memory bounds. Transitions are rare state changes and runs are a few a
 * day per job; access rows are many. */
export const OPS_EVENTS_KEEP = {
  transitions: 5000,
  runs: 2000,
  recent: 1000,
} as const;

const ITEM_KEYS = [
  "seq",
  "at",
  "kind",
  "subject",
  "from_state",
  "to_state",
  "status",
  "ms",
  "detail",
] as const;

type Base = { seq: number; at: string; subject: string };
/** Devices System names on access rows. A name outside this list reads as
 * "other" rather than rejecting the page, since the field is display only. */
export const OPS_DEVICES = [
  "ap-pro",
  "ap-phone",
  "ap-plus",
  "ap-mini",
  "loopback",
  "other",
] as const;
export type OpsDevice = (typeof OPS_DEVICES)[number];
export type OpsTransitionEvent = Base & {
  kind: "transition";
  /** Null on first sight. */
  from: OpsState | null;
  to: OpsState;
  detail: string | null;
};
export type OpsAccessEvent = Base & {
  kind: "access";
  status: number;
  ms: number;
  /** Optional: the device that made the read. */
  device: OpsDevice | null;
};
export type OpsRunEvent = Base & {
  kind: "run";
  /** launchd's exit code, when known. */
  exit: number | null;
  /** Duration in ms, when known. */
  ms: number | null;
  detail: string | null;
};
export type OpsOtherEvent = Base & {
  kind: "other";
  rawKind: string;
  detail: string | null;
};
export type OpsEvent =
  OpsTransitionEvent | OpsRunEvent | OpsAccessEvent | OpsOtherEvent;
export type OpsEventsPage = {
  items: OpsEvent[];
  nextAfter: number | null;
  /** The page's last seq, counting skipped items, so the cursor moves past
   * an item this client cannot read instead of asking for it again. */
  lastSeq: number | null;
  /** Items dropped because a known field was malformed. */
  skipped: number;
  /** Item field names this client does not know yet, sorted. */
  unknownFields: string[];
};

/** Whether a page's unreadable items are drift rather than strays: most
 * of the page. The reader still moves past them (refusing the page would
 * read the same items forever) and marks the events not current, so a
 * format change can never quietly empty Activity, run history or Alerts. */
export function opsEventsDrifted(skipped: number, items: number): boolean {
  return skipped > 0 && skipped * 2 > items;
}

function fail(): never {
  throw new OpsSnapshotError();
}

function nullable<T>(value: unknown, read: (value: unknown) => T): T | null {
  return value === null ? null : read(value);
}

function state(value: unknown): OpsState {
  return member(value, OPS_V1_STATES);
}

function device(value: unknown): OpsDevice {
  const name = text(value, 32);
  return OPS_DEVICES.includes(name as OpsDevice)
    ? (name as OpsDevice)
    : "other";
}

function item(value: unknown, drift: FieldDrift): OpsEvent {
  // `device` is optional on every item; unknown keys are only named.
  const e = known(value, ITEM_KEYS, ["device"], drift);
  const accessDevice =
    e.device === undefined ? null : nullable(e.device, device);
  const seq = integer(e.seq, 1, OPS_EVENTS_BOUNDS.maxSeq);
  const at = timestamp(e.at);
  const kind = text(e.kind, 32);
  if (!OPS_EVENTS_BOUNDS.kind.test(kind)) fail();
  const detail = nullable(e.detail, (v) =>
    text(v, OPS_EVENTS_BOUNDS.detailMax),
  );
  // Every field keeps its type whether or not this kind uses it.
  const from = nullable(e.from_state, state);
  const to = nullable(e.to_state, state);
  // An HTTP status on access rows, an exit code on run rows.
  const status = nullable(e.status, (v) =>
    integer(v, OPS_V1_BOUNDS.exitMin, OPS_V1_BOUNDS.exitMax),
  );
  const ms = nullable(e.ms, (v) => integer(v, 0, OPS_EVENTS_BOUNDS.maxRunMs));
  const subject = text(e.subject, OPS_EVENTS_BOUNDS.subjectMax);
  if (kind === "transition") {
    if (!OPS_V1_BOUNDS.id.test(subject) || to === null) fail();
    return { kind, seq, at, subject, from, to, detail };
  }
  if (kind === "run") {
    if (!OPS_V1_BOUNDS.id.test(subject)) fail();
    return { kind, seq, at, subject, exit: status, ms, detail };
  }
  if (kind === "access") {
    if (
      !OPS_EVENTS_BOUNDS.route.test(subject) ||
      status === null ||
      status < 100 ||
      status > 599 ||
      ms === null ||
      ms > OPS_EVENTS_BOUNDS.maxMs
    )
      fail();
    return { kind, seq, at, subject, status, ms, device: accessDevice };
  }
  return { kind: "other", rawKind: kind, seq, at, subject, detail };
}

/**
 * One page read with `after`. Items are oldest first, each seq above `after`
 * and above the one before it. `next_after` is null when the page is the
 * last, otherwise the last item's seq.
 *
 * An item whose own seq is readable but whose other known fields are not is
 * skipped and counted, never rendered: rejecting the page would clear the
 * log and read the same item again forever. The count reaches the log,
 * which shows it (a skipped item could be a failing transition, so it is
 * never dropped without a mark). When most of a page is unreadable that is
 * drift, not strays: the reader marks the events not current
 * (`opsEventsDrifted`). A bad seq or envelope still rejects the page.
 */
export function parseOpsEvents(value: unknown, after: number): OpsEventsPage {
  const root = exact(value, ["version", "items", "next_after"]);
  if (root.version !== OPS_EVENTS_VERSION) fail();
  if (
    !Array.isArray(root.items) ||
    root.items.length > OPS_EVENTS_BOUNDS.maxLimit
  )
    fail();
  const drift: FieldDrift = new Set();
  const items: OpsEvent[] = [];
  let previous = after;
  let skipped = 0;
  for (const value of root.items) {
    let event: OpsEvent | null = null;
    let seq: number;
    try {
      event = item(value, drift);
      seq = event.seq;
    } catch (error) {
      if (!(error instanceof OpsSnapshotError)) throw error;
      const raw = value as Record<string, unknown> | null;
      seq = integer(
        raw && typeof raw === "object" ? raw.seq : null,
        1,
        OPS_EVENTS_BOUNDS.maxSeq,
      );
      skipped++;
    }
    if (seq <= previous) fail();
    previous = seq;
    if (event) items.push(event);
  }
  const nextAfter = nullable(root.next_after, (v) =>
    integer(v, 1, OPS_EVENTS_BOUNDS.maxSeq),
  );
  if (nextAfter !== null && (root.items.length === 0 || nextAfter !== previous))
    fail();
  return {
    items,
    nextAfter,
    lastSeq: root.items.length ? previous : null,
    skipped,
    unknownFields: [...drift].sort(),
  };
}

export function parseOpsEventsBytes(
  bytes: Uint8Array,
  after: number,
): OpsEventsPage {
  if (bytes.byteLength > OPS_EVENTS_BOUNDS.maxBytes) fail();
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail();
  }
  return parseOpsEvents(value, after);
}

/** The reader holds an events request for at most this many seconds. */
export const OPS_EVENTS_MAX_WAIT_S = 25;

/** The request path for one page. `after` and `limit` are the contract's
 * paging params; `wait` (0 to 25 seconds) asks the reader to hold the request
 * until an event past `after` exists. */
export function opsEventsPath(
  after: number,
  limit: number = OPS_EVENTS_BOUNDS.maxLimit,
  wait: number | null = null,
) {
  integer(after, 0, OPS_EVENTS_BOUNDS.maxSeq);
  integer(limit, 1, OPS_EVENTS_BOUNDS.maxLimit);
  if (wait !== null) integer(wait, 0, OPS_EVENTS_MAX_WAIT_S);
  return `${OPS_EVENTS_PATH}?after=${after}&limit=${limit}${wait === null ? "" : `&wait=${wait}`}`;
}

/** What this page holds in memory: the cursor, every transition (for alerts
 * and each entry's changes), every run (for run history) and the newest
 * events of every kind (for Activity). */
export type OpsEventLog = {
  cursor: number;
  transitions: OpsTransitionEvent[];
  runs: OpsRunEvent[];
  recent: OpsEvent[];
  /** Item field names this client does not know yet, from every page read,
   * sorted: named in a drift notice, never read. */
  unknownFields: string[];
  /** Items skipped as unreadable since the log began: shown, never read. */
  skipped: number;
};

export const EMPTY_EVENT_LOG: OpsEventLog = Object.freeze({
  cursor: 0,
  transitions: [],
  runs: [],
  recent: [],
  unknownFields: [],
  skipped: 0,
}) as OpsEventLog;

/** `unknownFields` are the page's drift names; `through` is the page's last
 * seq when it ends on a skipped item; `skipped` is how many it skipped. */
export function appendOpsEvents(
  log: OpsEventLog,
  items: readonly OpsEvent[],
  unknownFields: readonly string[] = [],
  through: number | null = null,
  skipped = 0,
): OpsEventLog {
  if (skipped > 0) log = { ...log, skipped: log.skipped + skipped };
  const drift = unknownFields.filter(
    (name) => !log.unknownFields.includes(name),
  );
  if (drift.length)
    log = {
      ...log,
      unknownFields: [...log.unknownFields, ...drift]
        .sort()
        .slice(0, OPS_V1_BOUNDS.maxUnknownFields),
    };
  const cursor = Math.max(log.cursor, items.at(-1)?.seq ?? 0, through ?? 0);
  if (!items.length) return cursor === log.cursor ? log : { ...log, cursor };
  const transitions = [
    ...log.transitions,
    ...items.filter(
      (event): event is OpsTransitionEvent => event.kind === "transition",
    ),
  ].slice(-OPS_EVENTS_KEEP.transitions);
  const runs = [
    ...log.runs,
    ...items.filter((event): event is OpsRunEvent => event.kind === "run"),
  ].slice(-OPS_EVENTS_KEEP.runs);
  return {
    cursor,
    transitions,
    runs,
    recent: [...log.recent, ...items].slice(-OPS_EVENTS_KEEP.recent),
    unknownFields: log.unknownFields,
    skipped: log.skipped,
  };
}

/**
 * The earliest time from which the log holds every state change: its first
 * transition once the transitions were capped, else the oldest event of any
 * kind held. A catalog entry with no transition in the log has been in its
 * state since before this. Null when nothing is held.
 */
export function opsTransitionsFrom(log: OpsEventLog): string | null {
  if (log.transitions.length >= OPS_EVENTS_KEEP.transitions)
    return log.transitions[0]!.at;
  const firsts = [log.transitions[0], log.runs[0], log.recent[0]]
    .filter((event): event is OpsEvent => event !== undefined)
    .map((event) => event.at)
    .sort();
  return firsts[0] ?? null;
}

/** Whether a page of events changes what the snapshot says: a state change
 * or a finished run. Access rows never do. */
export function opsEventsMoveSnapshot(items: readonly OpsEvent[]): boolean {
  return items.some(
    (event) => event.kind === "transition" || event.kind === "run",
  );
}

/** The states that fire an alert. */
export const OPS_PROBLEM_STATES: readonly OpsState[] = [
  "failing",
  "stale",
  "degraded",
];

export type OpsAlert = {
  subject: string;
  /** Firing: the latest state is a problem. Resolved: a later ok. */
  status: "firing" | "resolved";
  /** The state of the episode's latest problem transition. */
  state: OpsState;
  /** The most severe state the episode reached: what a resolved incident
   * was. */
  peak: OpsState;
  /** When the episode began: its first problem transition. Null for a
   * problem the snapshot shows with no opening transition in the events
   * held (opsAlertRows): its start was never observed. */
  since: string | null;
  /** With no `since`: the oldest event held, which the problem is older
   * than, when the entry has no transition in the log at all. */
  startedBefore?: string | null;
  /** When the later ok arrived, for a resolved alert. */
  resolvedAt: string | null;
  detail: string | null;
  /** Every episode this entry had in the events held, this one included. */
  incidents: number;
};

/** An episode read from transitions: its start is always observed. */
export type OpsIncident = OpsAlert & { since: string };

/** Problem states, most severe first. */
const SEVERITY: readonly OpsState[] = ["failing", "degraded", "stale"];
/** The more severe of two states; a non-problem state never outranks. */
export const worse = (a: OpsState, b: OpsState) =>
  SEVERITY.indexOf(b) !== -1 &&
  (SEVERITY.indexOf(a) === -1 || SEVERITY.indexOf(b) < SEVERITY.indexOf(a))
    ? b
    : a;

/**
 * Alerts, derived only from transitions. Per catalog id, an episode starts
 * at the first problem state after an ok (or after first sight) and ends at
 * the next ok. Unknown and asleep neither fire nor resolve. One row per id:
 * its current episode if firing, otherwise its latest resolved one. Firing
 * alerts come first, newest episode first; then resolved, newest first.
 */
export function deriveOpsAlerts(
  transitions: readonly OpsTransitionEvent[],
): OpsIncident[] {
  const firing: OpsIncident[] = [];
  const resolved: OpsIncident[] = [];
  for (const episodes of opsIncidentsBySubject(transitions).values()) {
    const latest = episodes[0]!;
    if (latest.status === "firing") firing.push(latest);
    else resolved.push(latest);
  }
  firing.sort((a, b) => b.since.localeCompare(a.since));
  resolved.sort((a, b) => b.resolvedAt!.localeCompare(a.resolvedAt!));
  return [...firing, ...resolved];
}

/**
 * Every episode per catalog id, newest first: its current one when firing,
 * then each resolved one. An episode starts at the first problem state after
 * an ok (or after first sight) and ends at the next ok; unknown and asleep
 * neither start nor end one.
 */
export function opsIncidentsBySubject(
  transitions: readonly OpsTransitionEvent[],
): Map<string, OpsIncident[]> {
  type Open = { start: string; latest: OpsTransitionEvent; peak: OpsState };
  const open = new Map<string, Open>();
  const episodes = new Map<string, OpsIncident[]>();
  const push = (subject: string, alert: OpsIncident) => {
    const list = episodes.get(subject);
    if (list) list.unshift(alert);
    else episodes.set(subject, [alert]);
  };
  const latest = new Map<string, OpsState>();
  for (const event of [...transitions].sort((a, b) => a.seq - b.seq)) {
    latest.set(event.subject, event.to);
    const current = open.get(event.subject);
    if (OPS_PROBLEM_STATES.includes(event.to)) {
      open.set(event.subject, {
        start: current?.start ?? event.at,
        latest: event,
        peak: current ? worse(current.peak, event.to) : event.to,
      });
    } else if (event.to === "ok" && current) {
      push(event.subject, {
        subject: event.subject,
        status: "resolved",
        state: current.latest.to,
        peak: current.peak,
        since: current.start,
        resolvedAt: event.at,
        detail: current.latest.detail,
        incidents: 0,
      });
      open.delete(event.subject);
    }
  }
  // A problem that went unknown or asleep is not firing; a later ok still
  // resolves it.
  for (const [subject, current] of open)
    if (OPS_PROBLEM_STATES.includes(latest.get(subject)!))
      push(subject, {
        subject,
        status: "firing",
        state: current.latest.to,
        peak: current.peak,
        since: current.start,
        resolvedAt: null,
        detail: current.latest.detail,
        incidents: 0,
      });
  for (const list of episodes.values())
    for (const alert of list) alert.incidents = list.length;
  return episodes;
}

/** Reader route families, as Activity names them. */
const ROUTE_LABELS: Record<string, string> = {
  "data.status": "Data status",
  "data.search": "Data search",
  "data.get": "Data record",
  "data.record": "Data record",
  "data.sources": "Data sources",
  "health.health": "Health daily",
  "activity.activity": "Activity feed",
  "ops.snapshot": "Ops snapshot",
  "ops.events": "Ops events",
  preflight: "Preflight",
  invalid: "Invalid request",
  method: "Method not allowed",
  probe: "Reader probe",
};

export function opsRouteLabel(route: string): string {
  return ROUTE_LABELS[route] ?? route;
}

/** "Data search, 200, 84 ms", then the device when System names one. */
export function opsAccessSummary(event: OpsAccessEvent): string {
  const summary = `${opsRouteLabel(event.subject)}, ${event.status}, ${event.ms} ms`;
  return event.device ? `${summary}, ${event.device}` : summary;
}

export type OpsActivitySource = { id: string; label: string };

/** Access rows from admin's own ops polling: noise unless asked for. */
export const OPS_ADMIN_POLLING_SOURCE = "access:admin";

/** Routes that are plumbing rather than reads: CORS preflights, the
 * sampler's liveness probe and admin's own ops polling. */
const PLUMBING_ROUTES: ReadonlySet<string> = new Set([
  "preflight",
  "probe",
  "ops.snapshot",
  "ops.events",
]);

/** Whether Activity folds an event away by default: a plumbing access that
 * succeeded. A failure is never plumbing, since it is an exception. */
export function opsIsPlumbing(event: OpsEvent): boolean {
  return (
    event.kind === "access" &&
    PLUMBING_ROUTES.has(event.subject) &&
    event.status < 400
  );
}

/** Activity's source filter: transitions by catalog group, reader access,
 * then any other kind by name. */
export function opsActivitySource(
  event: OpsEvent,
  catalog: ReadonlyMap<string, OpsCatalogEntry>,
): OpsActivitySource {
  if (event.kind === "access")
    return event.subject === "ops.events" || event.subject === "ops.snapshot"
      ? { id: OPS_ADMIN_POLLING_SOURCE, label: "Admin polling" }
      : { id: "access", label: "Reader access" };
  if (event.kind === "other")
    return { id: `kind:${event.rawKind}`, label: humanize(event.rawKind) };
  if (event.kind === "run") return { id: "kind:run", label: "Runs" };
  const group = catalog.get(event.subject)?.group;
  return group
    ? { id: `group:${group}`, label: humanize(group) }
    : { id: "group:", label: "Not in the catalog" };
}

export function humanize(value: string): string {
  const words = value.replaceAll(/[_.-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
