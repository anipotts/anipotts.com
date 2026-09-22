/**
 * Strict client for System's ops_v1 snapshot (anipotts/system `docs/ops-v1.md`).
 *
 * System owns the catalog and the health evaluation; admin renders it
 * read-only. The parser follows the contract's client rules: unknown catalog
 * ids and groups are accepted and rendered generically, unknown fields inside
 * an entry are rejected, and a catalog entry without a status row is
 * `unknown`. Unknown never renders like ok.
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

export type OpsState = (typeof OPS_V1_STATES)[number];
export type OpsKind = (typeof OPS_V1_KINDS)[number];
export type OpsHost = (typeof OPS_V1_HOSTS)[number];

/** Client bounds. The contract caps the transport at 64 KB. */
export const OPS_V1_BOUNDS = {
  maxBytes: 64 * 1024,
  maxEntries: 500,
  id: /^[a-z0-9][a-z0-9.-]{0,63}$/,
  nameMax: 120,
  groupMax: 64,
  ownerMax: 64,
  detailMax: 160,
  runbookMax: 512,
  scheduleMax: 64,
  /** One year. A budget longer than that is not a freshness budget. */
  budgetMaxSeconds: 366 * 24 * 60 * 60,
  exitMin: -(2 ** 31),
  exitMax: 2 ** 31 - 1,
} as const;

export type OpsCatalogEntry = {
  id: string;
  name: string;
  group: string;
  kind: OpsKind;
  host: OpsHost;
  owner: string;
  freshness_budget_s: number | null;
  runbook: string;
  /** Short human string ("hourly", "daily 04:00", "continuous") or null. */
  schedule: string | null;
};

export type OpsStatusRow = {
  state: OpsState;
  detail: string;
  last_success_at: string | null;
  last_run_at: string | null;
  last_exit: number | null;
};

export type OpsCounts = Record<OpsState, number>;

export type OpsSnapshot = {
  version: typeof OPS_V1_VERSION;
  generated_at: string;
  catalog: OpsCatalogEntry[];
  /** Keyed by catalog id. A catalog id with no row here is unknown. */
  status: Map<string, OpsStatusRow>;
  counts: OpsCounts;
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
  "owner",
  "freshness_budget_s",
  "runbook",
  "schedule",
] as const;
const ROW_KEYS = [
  "state",
  "detail",
  "last_success_at",
  "last_run_at",
  "last_exit",
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

/** Exactly these keys: a missing field and an unknown field both reject. */
export function exact(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  const object = record(value);
  const present = Object.keys(object);
  if (
    present.some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(object, key))
  )
    fail();
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

function entry(value: unknown): OpsCatalogEntry {
  const e = exact(value, ENTRY_KEYS);
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
    host: member(e.host, OPS_V1_HOSTS),
    owner: text(e.owner, OPS_V1_BOUNDS.ownerMax),
    freshness_budget_s:
      e.freshness_budget_s === null
        ? null
        : integer(e.freshness_budget_s, 1, OPS_V1_BOUNDS.budgetMaxSeconds),
    runbook: runbook(e.runbook),
  };
}

function row(value: Record<string, unknown>, notAfter: number): OpsStatusRow {
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
): Map<string, OpsStatusRow> {
  if (!Array.isArray(value) || value.length > OPS_V1_BOUNDS.maxEntries) fail();
  const rows = new Map<string, OpsStatusRow>();
  for (const item of value) {
    const body = exact(item, ["id", ...ROW_KEYS]);
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
  const catalog = root.catalog.map(entry);
  const ids = new Set(catalog.map((item) => item.id));
  if (ids.size !== catalog.length) fail();
  return {
    version: OPS_V1_VERSION,
    generated_at: generatedAt,
    catalog,
    status: statusRows(root.status, ids, Date.parse(generatedAt)),
    counts: counts(root.counts),
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
};

export const MISSING_STATUS: OpsStatusRow = Object.freeze({
  state: "unknown",
  detail: "no status row",
  last_success_at: null,
  last_run_at: null,
  last_exit: null,
});

export function opsServices(snapshot: OpsSnapshot): OpsServiceView[] {
  return snapshot.catalog.map((item) => {
    const status = snapshot.status.get(item.id);
    return {
      ...item,
      status: status ?? MISSING_STATUS,
      missingStatus: !status,
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
 * Owner priority for the Status table: Personal Context memory, its
 * snapshots and offsite copies first, then health ingest, then agent
 * sessions, then services. Groups System adds later follow in catalog order.
 * The "hosts" group renders as the strip above the table, never in it.
 */
export const OPS_GROUP_PRIORITY = [
  "personal context",
  "backups",
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

/** Compact duration: `45s`, `12m`, `3h 5m`, `2d 4h`. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

const SYSTEM_BLOB = "https://github.com/anipotts/system/blob/main/";

/** Runbook href: https URLs as given, repo paths into anipotts/system. */
export function opsRunbookHref(runbook: string): string {
  return runbook.startsWith("https://")
    ? runbook
    : `${SYSTEM_BLOB}${runbook.split("/").map(encodeURIComponent).join("/")}`;
}
