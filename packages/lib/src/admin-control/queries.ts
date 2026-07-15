import {
  adminControlContracts,
  fixtureEvents,
  fixtureProjections,
} from "./fixtures";
import {
  ADMIN_EVENT_SCHEMA_VERSION,
  type AdminCapabilityState,
  type AdminControlProjections,
  type AdminControlSnapshot,
  type AdminControlSourceMode,
  type AdminDeployState,
  type AdminEventEnvelope,
  type AdminFleetStatus,
  type AdminInboxItem,
  type AdminPieceState,
  type AdminProjectState,
  type AdminServiceRegistryViewItem,
  type AdminTaskLineage,
  type AdminTaskState,
} from "./types";

type D1Result<T> = { results?: T[] };

export type AdminControlStatement = {
  bind(...values: unknown[]): AdminControlStatement;
  all<T = unknown>(): Promise<D1Result<T>>;
};

export type AdminControlDatabase =
  | {
      prepare(query: string): AdminControlStatement;
    }
  | null
  | undefined;

type ReadResult<T> = {
  rows: T[];
  usedFallback: boolean;
  error: string | null;
};

const SYNC_CONTRACT = {
  v1: "refresh-on-open-plus-light-polling",
  push_swappable: true,
  target: "durable-objects-websocket-hibernation",
} as const;

const RETENTION_CONTRACT = {
  event_store: "d1",
  payload_store: "r2",
  payload_ref_required: true,
  archive_target: "r2",
  archive_policy:
    "payload_ref blobs are external from day one; aged d1 envelopes archive to r2 without projection contract changes",
} as const;

const AUTH_CONTRACT = {
  ui: "passkey-session",
  mcp: "cloudflare-access-service-token-per-machine",
  write_tools: "disabled-until-broker-and-signed-connect-diff",
} as const;

export async function loadAdminControlSnapshot(
  db: AdminControlDatabase,
): Promise<AdminControlSnapshot> {
  const [
    events,
    inboxItems,
    projectStates,
    taskStates,
    taskLineage,
    pieceStates,
    fleetStatus,
    deployStates,
    capabilityStates,
    serviceRegistryView,
  ] = await Promise.all([
    readAdminEvents(db),
    readInboxItems(db),
    readProjectStates(db),
    readTaskStates(db),
    readTaskLineage(db),
    readPieceStates(db),
    readFleetStatus(db),
    readDeployStates(db),
    readCapabilityStates(db),
    readServiceRegistryView(db),
  ]);

  const reads = [
    events,
    inboxItems,
    projectStates,
    taskStates,
    taskLineage,
    pieceStates,
    fleetStatus,
    deployStates,
    capabilityStates,
    serviceRegistryView,
  ];

  const projections: AdminControlProjections = {
    inbox_items: sortInbox(dedupeByKey(inboxItems.rows, "dedupe_key")),
    project_states: dedupeByKey(projectStates.rows, "dedupe_key"),
    task_states: dedupeByKey(taskStates.rows, "dedupe_key"),
    task_lineage: dedupeByKey(taskLineage.rows, "lineage_id"),
    piece_states: pieceStates.rows,
    fleet_status: fleetStatus.rows,
    deploy_states: deployStates.rows,
    capability_states: capabilityStates.rows,
    service_registry_view: serviceRegistryView.rows,
  };

  return {
    schema_version: ADMIN_EVENT_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    source_mode: sourceMode(reads.map((read) => read.usedFallback)),
    sync: SYNC_CONTRACT,
    retention: RETENTION_CONTRACT,
    auth: AUTH_CONTRACT,
    contracts: adminControlContracts,
    events: dedupeByKey(events.rows, "dedupe_key"),
    projections,
    errors: reads.flatMap((read) => (read.error ? [read.error] : [])),
  };
}

async function readAdminEvents(
  db: AdminControlDatabase,
): Promise<ReadResult<AdminEventEnvelope>> {
  return readRows(
    db,
    "admin_events",
    `SELECT schema_version, event_id, dedupe_key, source, provider, account,
            actor, kind, ts, privacy, title, summary, href, payload_ref,
            created_by
       FROM admin_events
      ORDER BY ts DESC
      LIMIT 80`,
    fixtureEvents,
    (row) => ({
      schema_version: toNumber(row.schema_version, ADMIN_EVENT_SCHEMA_VERSION),
      event_id: asString(row.event_id),
      dedupe_key: asString(row.dedupe_key),
      source: asString(row.source),
      provider: nullableString(row.provider),
      account: nullableString(row.account),
      actor: asString(row.actor),
      kind: asString(row.kind),
      ts: asString(row.ts),
      privacy: asString(row.privacy),
      title: asString(row.title),
      summary: asString(row.summary),
      href: nullableString(row.href),
      payload_ref: nullableString(row.payload_ref),
      created_by: asString(row.created_by),
    }),
  );
}

async function readInboxItems(
  db: AdminControlDatabase,
): Promise<ReadResult<AdminInboxItem>> {
  return readRows(
    db,
    "admin_inbox_items",
    `SELECT item_id, dedupe_key, event_refs, domain, entity_ref,
            attention_kind, source, account, title, summary,
            href, status, urgency, owner, action_kind, expires_at, last_seen_at
       FROM admin_inbox_items
      ORDER BY
        CASE urgency
          WHEN 'urgent' THEN 0
          WHEN 'high' THEN 1
          WHEN 'normal' THEN 2
          ELSE 3
        END,
        COALESCE(expires_at, last_seen_at, '9999-12-31T23:59:59Z') ASC`,
    fixtureProjections.inbox_items,
    (row) => ({
      item_id: asString(row.item_id),
      dedupe_key: asString(row.dedupe_key),
      event_refs: parseStringArray(row.event_refs),
      domain: asString(row.domain),
      entity_ref: nullableString(row.entity_ref),
      attention_kind: asString(row.attention_kind),
      source: asString(row.source),
      account: nullableString(row.account),
      title: asString(row.title),
      summary: asString(row.summary),
      href: nullableString(row.href),
      status: asString(row.status),
      urgency: asString(row.urgency),
      owner: asString(row.owner),
      action_kind: asString(row.action_kind),
      expires_at: nullableString(row.expires_at),
      last_seen_at: nullableString(row.last_seen_at),
    }),
  );
}

async function readProjectStates(
  db: AdminControlDatabase,
): Promise<ReadResult<AdminProjectState>> {
  return readRows(
    db,
    "admin_project_states",
    `SELECT project_id, dedupe_key, title, domain, entity_ref, lifecycle,
            attention_kind, native_runtime_status, status_summary, owner,
            agent_source, event_refs, task_refs, updated_at
       FROM admin_project_states
      ORDER BY updated_at DESC`,
    fixtureProjections.project_states,
    (row) => ({
      project_id: asString(row.project_id),
      dedupe_key: asString(row.dedupe_key),
      title: asString(row.title),
      domain: asString(row.domain),
      entity_ref: nullableString(row.entity_ref),
      lifecycle: asString(row.lifecycle),
      attention_kind: asString(row.attention_kind),
      native_runtime_status: asString(row.native_runtime_status),
      status_summary: asString(row.status_summary),
      owner: asString(row.owner),
      agent_source: asString(row.agent_source),
      event_refs: parseStringArray(row.event_refs),
      task_refs: parseStringArray(row.task_refs),
      updated_at: nullableString(row.updated_at),
    }),
  );
}

async function readTaskStates(
  db: AdminControlDatabase,
): Promise<ReadResult<AdminTaskState>> {
  return readRows(
    db,
    "admin_task_states",
    `SELECT task_id, dedupe_key, project_ref, title, domain, entity_ref,
            lifecycle, attention_kind, native_runtime_status, status_summary,
            owner, agent_source, event_refs, blocked_by, updated_at
       FROM admin_task_states
      ORDER BY updated_at DESC`,
    fixtureProjections.task_states,
    (row) => ({
      task_id: asString(row.task_id),
      dedupe_key: asString(row.dedupe_key),
      project_ref: asString(row.project_ref),
      title: asString(row.title),
      domain: asString(row.domain),
      entity_ref: nullableString(row.entity_ref),
      lifecycle: asString(row.lifecycle),
      attention_kind: asString(row.attention_kind),
      native_runtime_status: asString(row.native_runtime_status),
      status_summary: asString(row.status_summary),
      owner: asString(row.owner),
      agent_source: asString(row.agent_source),
      event_refs: parseStringArray(row.event_refs),
      blocked_by: parseStringArray(row.blocked_by),
      updated_at: nullableString(row.updated_at),
    }),
  );
}

async function readTaskLineage(
  db: AdminControlDatabase,
): Promise<ReadResult<AdminTaskLineage>> {
  return readRows(
    db,
    "admin_task_lineage",
    `SELECT lineage_id, task_ref, parent_task_ref, root_task_ref, relation,
            agent_source, event_refs, updated_at
       FROM admin_task_lineage
      ORDER BY updated_at DESC`,
    fixtureProjections.task_lineage,
    (row) => ({
      lineage_id: asString(row.lineage_id),
      task_ref: asString(row.task_ref),
      parent_task_ref: nullableString(row.parent_task_ref),
      root_task_ref: asString(row.root_task_ref),
      relation: asString(row.relation),
      agent_source: asString(row.agent_source),
      event_refs: parseStringArray(row.event_refs),
      updated_at: nullableString(row.updated_at),
    }),
  );
}

async function readPieceStates(
  db: AdminControlDatabase,
): Promise<ReadResult<AdminPieceState>> {
  return readRows(
    db,
    "admin_piece_states",
    `SELECT piece_id, dedupe_key, event_refs, title, state, channels,
            source_refs, updated_at
       FROM admin_piece_states
      ORDER BY updated_at DESC`,
    fixtureProjections.piece_states,
    (row) => ({
      piece_id: asString(row.piece_id),
      dedupe_key: asString(row.dedupe_key),
      event_refs: parseStringArray(row.event_refs),
      title: asString(row.title),
      state: asString(row.state),
      channels: parseStringArray(row.channels),
      source_refs: parseStringArray(row.source_refs),
      updated_at: nullableString(row.updated_at),
    }),
  );
}

async function readFleetStatus(
  db: AdminControlDatabase,
): Promise<ReadResult<AdminFleetStatus>> {
  return readRows(
    db,
    "admin_fleet_status",
    `SELECT subject_id, kind, title, status, summary, owner, href, event_refs,
            updated_at
       FROM admin_fleet_status
      ORDER BY updated_at DESC`,
    fixtureProjections.fleet_status,
    (row) => ({
      subject_id: asString(row.subject_id),
      kind: asString(row.kind),
      title: asString(row.title),
      status: asString(row.status),
      summary: asString(row.summary),
      owner: asString(row.owner),
      href: nullableString(row.href),
      event_refs: parseStringArray(row.event_refs),
      updated_at: nullableString(row.updated_at),
    }),
  );
}

async function readDeployStates(
  db: AdminControlDatabase,
): Promise<ReadResult<AdminDeployState>> {
  return readRows(
    db,
    "admin_deploy_states",
    `SELECT deploy_id, target, status, scope, href, last_run_at, event_refs,
            updated_at
       FROM admin_deploy_states
      ORDER BY COALESCE(last_run_at, updated_at) DESC`,
    fixtureProjections.deploy_states,
    (row) => ({
      deploy_id: asString(row.deploy_id),
      target: asString(row.target),
      status: asString(row.status),
      scope: asString(row.scope),
      href: nullableString(row.href),
      last_run_at: nullableString(row.last_run_at),
      event_refs: parseStringArray(row.event_refs),
      updated_at: nullableString(row.updated_at),
    }),
  );
}

async function readCapabilityStates(
  db: AdminControlDatabase,
): Promise<ReadResult<AdminCapabilityState>> {
  return readRows(
    db,
    "admin_capability_states",
    `SELECT capability_id, machine, status, auth_model, write_enabled, summary,
            event_refs, updated_at
       FROM admin_capability_states
      ORDER BY machine ASC, capability_id ASC`,
    fixtureProjections.capability_states,
    (row) => ({
      capability_id: asString(row.capability_id),
      machine: asString(row.machine),
      status: asString(row.status),
      auth_model: asString(row.auth_model),
      write_enabled: toBoolean(row.write_enabled),
      summary: asString(row.summary),
      event_refs: parseStringArray(row.event_refs),
      updated_at: nullableString(row.updated_at),
    }),
  );
}

async function readServiceRegistryView(
  db: AdminControlDatabase,
): Promise<ReadResult<AdminServiceRegistryViewItem>> {
  return readRows(
    db,
    "service_registry",
    `SELECT id AS service_id, name, hostname, visibility, owner,
            CASE WHEN retired_at IS NULL THEN 'active' ELSE 'retired' END AS status,
            updated_at
       FROM service_registry
      ORDER BY COALESCE(updated_at, created_at) DESC
      LIMIT 80`,
    fixtureProjections.service_registry_view,
    (row) => ({
      service_id: asString(row.service_id),
      name: asString(row.name),
      hostname: asString(row.hostname),
      visibility: asString(row.visibility),
      owner: asString(row.owner),
      status: asString(row.status),
      updated_at: nullableString(row.updated_at),
      event_refs: [],
    }),
  );
}

async function readRows<T>(
  db: AdminControlDatabase,
  tableName: string,
  query: string,
  fallback: T[],
  mapRow: (row: Record<string, unknown>) => T,
): Promise<ReadResult<T>> {
  if (!db) {
    return {
      rows: fallback,
      usedFallback: true,
      error: "d1 unavailable; using static admin-control fixture",
    };
  }

  try {
    const result = await db.prepare(query).all<Record<string, unknown>>();
    const rows = Array.isArray(result.results)
      ? result.results.map(mapRow)
      : [];
    return {
      rows,
      usedFallback: false,
      error: null,
    };
  } catch (error) {
    return {
      rows: [],
      usedFallback: false,
      error: `${tableName} read failed: ${String(error)}`,
    };
  }
}

function sourceMode(fallbacks: boolean[]): AdminControlSourceMode {
  if (fallbacks.every(Boolean)) return "fixture";
  if (fallbacks.some(Boolean)) return "mixed";
  return "d1";
}

function sortInbox(items: AdminInboxItem[]): AdminInboxItem[] {
  const rank = new Map([
    ["urgent", 0],
    ["high", 1],
    ["normal", 2],
    ["low", 3],
  ]);
  return [...items].sort((a, b) => {
    const urgency = (rank.get(a.urgency) ?? 4) - (rank.get(b.urgency) ?? 4);
    if (urgency !== 0) return urgency;
    return (a.expires_at ?? "9999").localeCompare(b.expires_at ?? "9999");
  });
}

function dedupeByKey<T extends object>(rows: T[], key: keyof T): T[] {
  const unique = new Map<string, T>();
  for (const row of rows) {
    const dedupeKey = asString(row[key]);
    if (dedupeKey.length > 0) unique.set(dedupeKey, row);
  }
  return [...unique.values()];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function nullableString(value: unknown): string | null {
  const text = asString(value);
  return text.length > 0 ? text : null;
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((item) => typeof item === "string");
  if (typeof value !== "string" || value.length === 0) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
