/**
 * Strict client for System's ops_v1 snapshot (anipotts/system `docs/ops-v1.md`).
 *
 * System owns the catalog and the health evaluation; admin renders it
 * read-only. Unknown catalog ids and groups are accepted and rendered
 * generically, and a catalog entry without a status row is `unknown`. Unknown
 * never renders like ok.
 *
 * Every field this client knows is validated strictly, and a malformed one
 * rejects the snapshot. A field it does not know inside an entry or a row is
 * never read: its name is recorded in `unknown_fields` for a drift notice and
 * the page keeps working. (On 2026-09-22 System added row fields, and rejecting
 * unknown fields blanked Observability until admin caught up.) The root keys
 * and the counts stay exact, since a new top-level field bumps `version`.
 *
 * Rejection throws `OpsSnapshotError` with a fixed message. Rejected input is
 * never echoed into the message, the UI or a log.
 */

export const OPS_V1_VERSION = "ops_v1";
export const OPS_V1_STATES = [
  "ok",
  "degraded",
  "failing",
  "stale",
  "asleep",
  "unknown",
] as const;
export const OPS_V1_KINDS = [
  "job",
  "service",
  "host",
  "backup",
  "web",
] as const;
export const OPS_V1_HOSTS = ["ap-mini", "ap-pro", "cloudflare"] as const;
/** How launchd starts a job, read from its plist. `sampled` is a host row. */
export const OPS_V1_TRIGGERS = [
  "interval",
  "calendar",
  "keepalive",
  "watch",
  "manual",
  "sampled",
] as const;

export type OpsState = (typeof OPS_V1_STATES)[number];
export type OpsKind = (typeof OPS_V1_KINDS)[number];
/** A known host, or `other` for a machine System adds before admin knows it. */
export type OpsHost = (typeof OPS_V1_HOSTS)[number] | "other";
export type OpsTrigger = (typeof OPS_V1_TRIGGERS)[number];

/** Client bounds. The contract caps the transport at 64 KB. */
export const OPS_V1_BOUNDS = {
  maxBytes: 64 * 1024,
  maxEntries: 500,
  id: /^[a-z0-9][a-z0-9.-]{0,63}$/,
  nameMax: 120,
  groupMax: 64,
  detailMax: 160,
  runbookMax: 512,
  scheduleMax: 64,
  /** One year. A budget longer than that is not a freshness budget. */
  budgetMaxSeconds: 366 * 24 * 60 * 60,
  exitMin: -(2 ** 31),
  exitMax: 2 ** 31 - 1,
  runsMax: 2 ** 31 - 1,
  trigger: /^[a-z][a-z0-9_-]{0,31}$/,
  host: /^[a-z0-9][a-z0-9-]{0,31}$/,
  /** Ten years of uptime. */
  uptimeMaxSeconds: 10 * 366 * 24 * 60 * 60,
  /** A field name worth naming in a drift notice. */
  fieldName: /^[a-z][a-z0-9_]{0,31}$/,
  maxUnknownFields: 16,
} as const;

export type OpsCatalogEntry = {
  id: string;
  name: string;
  group: string;
  kind: OpsKind;
  host: OpsHost;
  freshness_budget_s: number | null;
  runbook: string;
  /** Short human string ("hourly", "daily 04:00", "continuous") or null. */
  schedule: string | null;
  /** Null when System sends none, or a trigger this client does not know. */
  trigger: OpsTrigger | null;
};

export type OpsStatusRow = {
  state: OpsState;
  detail: string;
  last_success_at: string | null;
  last_run_at: string | null;
  last_exit: number | null;
  /** launchd's run count. */
  runs: number | null;
  /** StartInterval seconds. */
  interval_s: number | null;
  /** Seconds the last receipted run took. */
  last_duration_s: number | null;
  /** Approximate for interval jobs; the only timestamp that may postdate the
   * snapshot. */
  next_run_at: string | null;
  /** Host rows: disk use, uptime and whether the machine is awake. */
  disk_percent: number | null;
  uptime_s: number | null;
  awake: boolean | null;
};

export type OpsCounts = Record<OpsState, number>;

export type OpsSnapshot = {
  version: typeof OPS_V1_VERSION;
  generated_at: string;
  catalog: OpsCatalogEntry[];
  /** Keyed by catalog id. A catalog id with no row here is unknown. */
  status: Map<string, OpsStatusRow>;
  counts: OpsCounts;
  /** Field names System sent that this client does not know yet, sorted.
   * Never read; only named, so an admin release can catch up. */
  unknown_fields: string[];
};

export class OpsSnapshotError extends Error {
  constructor() {
    super("Invalid ops_v1 snapshot");
    this.name = "OpsSnapshotError";
  }
}

function fail(): never {
  throw new OpsSnapshotError();
}

const ENTRY_KEYS = [
  "id",
  "name",
  "group",
  "kind",
  "host",
  "freshness_budget_s",
  "runbook",
  "schedule",
] as const;
const ENTRY_OPTIONAL_KEYS = ["trigger"] as const;
/** Fields System still sends that admin accepts and never reads, so they
 * raise no drift notice and System can drop them without breaking the
 * snapshot. `owner` is System's retired owner taxonomy (memory, system/chief,
 * life/chief); nothing in admin shows it. */
const ENTRY_IGNORED_KEYS = ["owner"] as const;
const ROW_KEYS = [
  "state",
  "detail",
  "last_success_at",
  "last_run_at",
  "last_exit",
] as const;
const ROW_OPTIONAL_KEYS = [
  "runs",
  "interval_s",
  "last_duration_s",
  "next_run_at",
  "disk_percent",
  "uptime_s",
  "awake",
] as const;
const ROOT_KEYS = [
  "version",
  "generated_at",
  "catalog",
  "status",
  "counts",
] as const;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}

/** Exactly these keys, plus any of `optional`: a missing required field and
 * an unknown field both reject. */
export function exact(
  value: unknown,
  keys: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  const object = record(value);
  const present = Object.keys(object);
  if (
    present.some((key) => !keys.includes(key) && !optional.includes(key)) ||
    keys.some((key) => !Object.hasOwn(object, key))
  )
    fail();
  return object;
}

/** Field names outside a known shape, collected for a drift notice. */
export type FieldDrift = Set<string>;

/**
 * These keys must be present and any of `optional` may be. Any other key is
 * never read: a plain field name is noted in `drift` (bounded), and any other
 * name is noted as `other`, since it is only ever named, never rendered.
 */
export function known(
  value: unknown,
  keys: readonly string[],
  optional: readonly string[],
  drift: FieldDrift,
): Record<string, unknown> {
  const object = record(value);
  if (keys.some((key) => !Object.hasOwn(object, key))) fail();
  for (const key of Object.keys(object)) {
    if (keys.includes(key) || optional.includes(key)) continue;
    if (drift.size >= OPS_V1_BOUNDS.maxUnknownFields) break;
    drift.add(OPS_V1_BOUNDS.fieldName.test(key) ? key : "other");
  }
  return object;
}

/** C0, DEL, C1 and the Unicode line and paragraph separators. */
export function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (
      code < 0x20 ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x2028 ||
      code === 0x2029
    )
      return true;
  }
  return false;
}

/** Non-empty, bounded, single-line text with no control characters. */
export function text(value: unknown, max: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > max ||
    value.trim() !== value ||
    hasControlCharacter(value)
  )
    fail();
  return value;
}

export function member<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) fail();
  return value as T;
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** UTC `YYYY-MM-DDTHH:MM:SSZ` that names a real instant. */
export function timestamp(value: unknown): string {
  if (typeof value !== "string" || !TIMESTAMP.test(value)) fail();
  const ms = Date.parse(value);
  if (
    !Number.isFinite(ms) ||
    new Date(ms).toISOString() !== `${value.slice(0, -1)}.000Z`
  )
    fail();
  return value;
}

function optionalTimestamp(value: unknown, notAfter: number): string | null {
  if (value === null) return null;
  const result = timestamp(value);
  // An observation cannot postdate the snapshot that reports it.
  if (Date.parse(result) > notAfter) fail();
  return result;
}

export function integer(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    fail();
  return value;
}

/**
 * A repo-relative path in anipotts/system, or an https URL. Relative paths
 * stay inside the repository: no leading slash, no `..`, no empty segment.
 */
function runbook(value: unknown): string {
  const result = text(value, OPS_V1_BOUNDS.runbookMax);
  if (result.startsWith("https://")) {
    let url: URL;
    try {
      url = new URL(result);
    } catch {
      return fail();
    }
    if (url.protocol !== "https:" || url.username || url.password || !url.host)
      fail();
    return result;
  }
  if (
    !/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(result) ||
    result.split("/").some((segment) => segment === "." || segment === "..")
  )
    fail();
  return result;
}

/** A known host, or `other` for a well-formed name this client does not know,
 * so adding a machine to the fleet never rejects the snapshot. */
function host(value: unknown): OpsHost {
  if (typeof value !== "string" || !OPS_V1_BOUNDS.host.test(value)) fail();
  return (OPS_V1_HOSTS as readonly string[]).includes(value)
    ? (value as OpsHost)
    : "other";
}

/** A known trigger, or null for none or one this client does not know yet
 * (System adds triggers without a website deploy). */
function trigger(value: unknown): OpsTrigger | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !OPS_V1_BOUNDS.trigger.test(value)) fail();
  return (OPS_V1_TRIGGERS as readonly string[]).includes(value)
    ? (value as OpsTrigger)
    : null;
}

/** A finite, non-negative number of seconds, at most `max`. */
function seconds(value: unknown, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max
  )
    fail();
  return value;
}

function entry(value: unknown, drift: FieldDrift): OpsCatalogEntry {
  const e = known(
    value,
    ENTRY_KEYS,
    [...ENTRY_OPTIONAL_KEYS, ...ENTRY_IGNORED_KEYS],
    drift,
  );
  if (typeof e.id !== "string" || !OPS_V1_BOUNDS.id.test(e.id)) fail();
  return {
    // Short human string, such as "hourly" or "daily 04:00", or null.
    schedule:
      e.schedule === null ? null : text(e.schedule, OPS_V1_BOUNDS.scheduleMax),
    id: e.id,
    name: text(e.name, OPS_V1_BOUNDS.nameMax),
    // Groups are free strings; System adds them without a website deploy.
    group: text(e.group, OPS_V1_BOUNDS.groupMax),
    kind: member(e.kind, OPS_V1_KINDS),
    host: host(e.host),
    freshness_budget_s:
      e.freshness_budget_s === null
        ? null
        : integer(e.freshness_budget_s, 1, OPS_V1_BOUNDS.budgetMaxSeconds),
    runbook: runbook(e.runbook),
    trigger: trigger(e.trigger),
  };
}

/** Absent and null both read as null. */
function optional<T>(value: unknown, read: (value: unknown) => T): T | null {
  return value === undefined || value === null ? null : read(value);
}

function row(value: Record<string, unknown>, notAfter: number): OpsStatusRow {
  const budget = OPS_V1_BOUNDS.budgetMaxSeconds;
  return {
    state: member(value.state, OPS_V1_STATES),
    detail: text(value.detail, OPS_V1_BOUNDS.detailMax),
    last_success_at: optionalTimestamp(value.last_success_at, notAfter),
    last_run_at: optionalTimestamp(value.last_run_at, notAfter),
    last_exit:
      value.last_exit === null
        ? null
        : integer(
            value.last_exit,
            OPS_V1_BOUNDS.exitMin,
            OPS_V1_BOUNDS.exitMax,
          ),
    runs: optional(value.runs, (v) => integer(v, 0, OPS_V1_BOUNDS.runsMax)),
    interval_s: optional(value.interval_s, (v) => integer(v, 1, budget)),
    last_duration_s: optional(value.last_duration_s, (v) => seconds(v, budget)),
    // A next run is in the future, but not beyond a year past the snapshot.
    next_run_at: optional(value.next_run_at, (v) => {
      const at = timestamp(v);
      if (Date.parse(at) > notAfter + budget * 1000) fail();
      return at;
    }),
    disk_percent: optional(value.disk_percent, (v) => integer(v, 0, 100)),
    uptime_s: optional(value.uptime_s, (v) =>
      integer(v, 0, OPS_V1_BOUNDS.uptimeMaxSeconds),
    ),
    awake: optional(value.awake, (v) => {
      if (typeof v !== "boolean") fail();
      return v;
    }),
  };
}

/**
 * Status is an array of rows, each carrying its catalog `id` (canonical per
 * System). A duplicate id, or a row for an id outside the catalog, rejects
 * the snapshot.
 */
function statusRows(
  value: unknown,
  catalogIds: Set<string>,
  notAfter: number,
  drift: FieldDrift,
): Map<string, OpsStatusRow> {
  if (!Array.isArray(value) || value.length > OPS_V1_BOUNDS.maxEntries) fail();
  const rows = new Map<string, OpsStatusRow>();
  for (const item of value) {
    const body = known(item, ["id", ...ROW_KEYS], ROW_OPTIONAL_KEYS, drift);
    const id = body.id;
    if (typeof id !== "string" || !catalogIds.has(id) || rows.has(id)) fail();
    rows.set(id, row(body, notAfter));
  }
  return rows;
}

function counts(value: unknown): OpsCounts {
  const object = exact(value, OPS_V1_STATES);
  const result = {} as OpsCounts;
  for (const state of OPS_V1_STATES)
    result[state] = integer(object[state], 0, OPS_V1_BOUNDS.maxEntries);
  return result;
}

/** Parses decoded JSON. Throws `OpsSnapshotError` on any contract violation. */
export function parseOpsSnapshot(value: unknown): OpsSnapshot {
  const root = exact(value, ROOT_KEYS);
  if (root.version !== OPS_V1_VERSION) fail();
  const generatedAt = timestamp(root.generated_at);
  if (
    !Array.isArray(root.catalog) ||
    root.catalog.length > OPS_V1_BOUNDS.maxEntries
  )
    fail();
  const drift: FieldDrift = new Set();
  const catalog = root.catalog.map((item) => entry(item, drift));
  const ids = new Set(catalog.map((item) => item.id));
  if (ids.size !== catalog.length) fail();
  const status = statusRows(root.status, ids, Date.parse(generatedAt), drift);
  return {
    version: OPS_V1_VERSION,
    generated_at: generatedAt,
    catalog,
    status,
    counts: counts(root.counts),
    unknown_fields: [...drift].sort(),
  };
}

/** Parses the UTF-8 body of a snapshot response, enforcing the byte cap. */
export function parseOpsSnapshotBytes(bytes: Uint8Array): OpsSnapshot {
  if (bytes.byteLength > OPS_V1_BOUNDS.maxBytes) fail();
  let decoded: unknown;
  try {
    decoded = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch {
    return fail();
  }
  return parseOpsSnapshot(decoded);
}

/** One rendered service: its catalog entry and its status, never absent. */
export type OpsServiceView = OpsCatalogEntry & {
  status: OpsStatusRow;
  /** True when System sent no status row; the state is then `unknown`. */
  missingStatus: boolean;
  /** The snapshot's `generated_at`: when System observed this row. */
  sampledAt: string;
};

export const MISSING_STATUS: OpsStatusRow = Object.freeze({
  state: "unknown",
  detail: "no status row",
  last_success_at: null,
  last_run_at: null,
  last_exit: null,
  runs: null,
  interval_s: null,
  last_duration_s: null,
  next_run_at: null,
  disk_percent: null,
  uptime_s: null,
  awake: null,
});

export function opsServices(snapshot: OpsSnapshot): OpsServiceView[] {
  return snapshot.catalog.map((item) => {
    const status = snapshot.status.get(item.id);
    return {
      ...item,
      status: status ?? MISSING_STATUS,
      missingStatus: !status,
      sampledAt: snapshot.generated_at,
    };
  });
}

/**
 * System's sampler rewrites the snapshot continuously. A `generated_at` older
 * than this means the sampler stopped, and every value is only last known.
 */
export const OPS_SAMPLER_STALE_SECONDS = 60;

/** Seconds since System generated the snapshot, never negative. */
export function opsSnapshotAge(snapshot: OpsSnapshot, now: number): number {
  return Math.max(
    0,
    Math.floor((now - Date.parse(snapshot.generated_at)) / 1000),
  );
}

export function opsSamplerStopped(snapshot: OpsSnapshot, now: number) {
  return opsSnapshotAge(snapshot, now) > OPS_SAMPLER_STALE_SECONDS;
}

/**
 * Group order for the Status table: Personal Context memory, its
 * snapshots and offsite copies first, then restore drills (recovery), then
 * health ingest, then agent sessions, then services. Groups System adds
 * later follow in catalog order. The "hosts" group renders as the strip
 * above the table, never in it.
 */
export const OPS_GROUP_PRIORITY = [
  "personal context",
  "backups",
  "recovery",
  "health ingest",
  "agent sessions",
  "services",
] as const;
export const OPS_HOSTS_GROUP = "hosts";

/** Hosts go in the strip: the hosts group and any host-kind entry. */
export function opsIsHost(service: OpsCatalogEntry): boolean {
  return service.kind === "host" || service.group === OPS_HOSTS_GROUP;
}
/** Kept, but never featured: these sort to the end of their group. */
export const OPS_TRAILING_IDS = ["imessage.agent"] as const;

/** Stable order: group priority, then catalog order, trailing ids last. */
export function opsOrdered(services: OpsServiceView[]): OpsServiceView[] {
  const rank = (group: string) => {
    const index = (OPS_GROUP_PRIORITY as readonly string[]).indexOf(group);
    return index === -1 ? OPS_GROUP_PRIORITY.length : index;
  };
  const firstSeen = new Map<string, number>();
  services.forEach((service, index) => {
    if (!firstSeen.has(service.group)) firstSeen.set(service.group, index);
  });
  const trailing = (id: string) =>
    (OPS_TRAILING_IDS as readonly string[]).includes(id) ? 1 : 0;
  return services
    .map((service, index) => ({ service, index }))
    .sort(
      (a, b) =>
        rank(a.service.group) - rank(b.service.group) ||
        firstSeen.get(a.service.group)! - firstSeen.get(b.service.group)! ||
        trailing(a.service.id) - trailing(b.service.id) ||
        a.index - b.index,
    )
    .map(({ service }) => service);
}

/** Counts over what is rendered, with missing rows counted as unknown. */
export function opsRenderedCounts(services: OpsServiceView[]): OpsCounts {
  const result = Object.fromEntries(
    OPS_V1_STATES.map((state) => [state, 0]),
  ) as OpsCounts;
  for (const service of services) result[service.status.state]++;
  return result;
}

export type OpsFreshness =
  | { kind: "never" }
  | { kind: "liveness"; ageSeconds: number }
  | {
      kind: "budget";
      ageSeconds: number;
      budgetSeconds: number;
      overBudget: boolean;
    };

/** Age of the last success against the entry's own freshness budget. */
export function opsFreshness(
  service: OpsServiceView,
  now: number,
): OpsFreshness {
  const at = service.status.last_success_at;
  if (!at) return { kind: "never" };
  const ageSeconds = Math.max(0, Math.floor((now - Date.parse(at)) / 1000));
  const budget = service.freshness_budget_s;
  if (budget === null) return { kind: "liveness", ageSeconds };
  return {
    kind: "budget",
    ageSeconds,
    budgetSeconds: budget,
    overBudget: ageSeconds > budget,
  };
}

const SYSTEM_BLOB = "https://github.com/anipotts/system/blob/main/";

/** Runbook href: https URLs as given, repo paths into anipotts/system. */
export function opsRunbookHref(runbook: string): string {
  return runbook.startsWith("https://")
    ? runbook
    : `${SYSTEM_BLOB}${runbook.split("/").map(encodeURIComponent).join("/")}`;
}
