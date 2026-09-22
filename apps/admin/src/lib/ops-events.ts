import {
  OPS_V1_BOUNDS,
  OPS_V1_STATES,
  OpsSnapshotError,
  exact,
  integer,
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
 * Every item carries exactly nine keys, plus an optional `device` on access
 * rows. `transition` rows name a catalog id
 * and the state it moved to; `access` rows name a reader route family with a
 * status and latency and never carry query text, ids or identity. A kind this
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
  kind: /^[a-z][a-z0-9_.-]{0,31}$/,
  route: /^[a-z][a-z0-9_.]{0,39}$/,
  subjectMax: 64,
  detailMax: OPS_V1_BOUNDS.detailMax,
} as const;

/** Pages read per poll, so a first read after a long gap still finishes. */
export const OPS_EVENTS_PAGES_PER_READ = 10;
/** Memory bounds. Transitions are rare state changes; access rows are many. */
export const OPS_EVENTS_KEEP = { transitions: 5000, recent: 1000 } as const;

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
export type OpsOtherEvent = Base & {
  kind: "other";
  rawKind: string;
  detail: string | null;
};
export type OpsEvent = OpsTransitionEvent | OpsAccessEvent | OpsOtherEvent;
export type OpsEventsPage = { items: OpsEvent[]; nextAfter: number | null };

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

function item(value: unknown): OpsEvent {
  // `device` is optional on every item; any other key outside the nine rejects.
  const raw = value as Record<string, unknown> | null;
  const hasDevice =
    raw !== null && typeof raw === "object" && Object.hasOwn(raw, "device");
  const e = exact(value, hasDevice ? [...ITEM_KEYS, "device"] : ITEM_KEYS);
  const accessDevice = hasDevice ? nullable(e.device, device) : null;
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
  const status = nullable(e.status, (v) => integer(v, 100, 599));
  const ms = nullable(e.ms, (v) => integer(v, 0, OPS_EVENTS_BOUNDS.maxMs));
  const subject = text(e.subject, OPS_EVENTS_BOUNDS.subjectMax);
  if (kind === "transition") {
    if (!OPS_V1_BOUNDS.id.test(subject) || to === null) fail();
    return { kind, seq, at, subject, from, to, detail };
  }
  if (kind === "access") {
    if (
      !OPS_EVENTS_BOUNDS.route.test(subject) ||
      status === null ||
      ms === null
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
 */
export function parseOpsEvents(value: unknown, after: number): OpsEventsPage {
  const root = exact(value, ["version", "items", "next_after"]);
  if (root.version !== OPS_EVENTS_VERSION) fail();
  if (
    !Array.isArray(root.items) ||
    root.items.length > OPS_EVENTS_BOUNDS.maxLimit
  )
    fail();
  const items = root.items.map(item);
  let previous = after;
  for (const event of items) {
    if (event.seq <= previous) fail();
    previous = event.seq;
  }
  const nextAfter = nullable(root.next_after, (v) =>
    integer(v, 1, OPS_EVENTS_BOUNDS.maxSeq),
  );
  if (nextAfter !== null && (items.length === 0 || nextAfter !== previous))
    fail();
  return { items, nextAfter };
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

/** What this page holds in memory: the cursor, every transition (for alerts)
 * and the newest events of every kind (for Activity). */
export type OpsEventLog = {
  cursor: number;
  transitions: OpsTransitionEvent[];
  recent: OpsEvent[];
};

export const EMPTY_EVENT_LOG: OpsEventLog = Object.freeze({
  cursor: 0,
  transitions: [],
  recent: [],
}) as OpsEventLog;

export function appendOpsEvents(
  log: OpsEventLog,
  items: readonly OpsEvent[],
): OpsEventLog {
  if (!items.length) return log;
  const transitions = [
    ...log.transitions,
    ...items.filter(
      (event): event is OpsTransitionEvent => event.kind === "transition",
    ),
  ].slice(-OPS_EVENTS_KEEP.transitions);
  return {
    cursor: items.at(-1)!.seq,
    transitions,
    recent: [...log.recent, ...items].slice(-OPS_EVENTS_KEEP.recent),
  };
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
  /** When the episode began: its first problem transition. */
  since: string;
  /** When the later ok arrived, for a resolved alert. */
  resolvedAt: string | null;
  detail: string | null;
};

/**
 * Alerts, derived only from transitions. Per catalog id, an episode starts
 * at the first problem state after an ok (or after first sight) and ends at
 * the next ok. Unknown and asleep neither fire nor resolve. One row per id:
 * its current episode if firing, otherwise its latest resolved one. Firing
 * alerts come first, newest episode first; then resolved, newest first.
 */
export function deriveOpsAlerts(
  transitions: readonly OpsTransitionEvent[],
): OpsAlert[] {
  const bySubject = new Map<
    string,
    {
      start: string | null;
      latest: OpsTransitionEvent;
      problem: OpsTransitionEvent | null;
      resolved: OpsAlert | null;
    }
  >();
  for (const event of [...transitions].sort((a, b) => a.seq - b.seq)) {
    const entry = bySubject.get(event.subject) ?? {
      start: null,
      latest: event,
      problem: null,
      resolved: null,
    };
    entry.latest = event;
    if (OPS_PROBLEM_STATES.includes(event.to)) {
      entry.start ??= event.at;
      entry.problem = event;
    } else if (event.to === "ok" && entry.start !== null && entry.problem) {
      entry.resolved = {
        subject: event.subject,
        status: "resolved",
        state: entry.problem.to,
        since: entry.start,
        resolvedAt: event.at,
        detail: entry.problem.detail,
      };
      entry.start = null;
      entry.problem = null;
    }
    bySubject.set(event.subject, entry);
  }
  const firing: OpsAlert[] = [];
  const resolved: OpsAlert[] = [];
  for (const [subject, entry] of bySubject) {
    if (OPS_PROBLEM_STATES.includes(entry.latest.to) && entry.start)
      firing.push({
        subject,
        status: "firing",
        state: entry.latest.to,
        since: entry.start,
        resolvedAt: null,
        detail: entry.latest.detail,
      });
    else if (entry.resolved) resolved.push(entry.resolved);
  }
  firing.sort((a, b) => b.since.localeCompare(a.since));
  resolved.sort((a, b) => b.resolvedAt!.localeCompare(a.resolvedAt!));
  return [...firing, ...resolved];
}

/** Reader route families, as Activity names them. */
const ROUTE_LABELS: Record<string, string> = {
  "data.status": "Data status",
  "data.search": "Data search",
  "data.get": "Data record",
  "data.record": "Data record",
  "data.sources": "Data sources",
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

/** Activity's source filter: transitions by catalog group, reader access,
 * then any other kind by name. */
/** Access rows from admin's own ops polling: noise unless asked for. */
export const OPS_ADMIN_POLLING_SOURCE = "access:admin";

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
  const group = catalog.get(event.subject)?.group;
  return group
    ? { id: `group:${group}`, label: humanize(group) }
    : { id: "group:", label: "Not in the catalog" };
}

export function humanize(value: string): string {
  const words = value.replaceAll(/[_.-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
