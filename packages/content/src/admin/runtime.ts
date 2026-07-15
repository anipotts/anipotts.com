export const RUNTIME_FEED_PATH =
  "/Users/anipotts/Infra/state/runtime/admin/admin-feed.current.json";

export type RuntimeDeployImpact =
  | "none"
  | "local_only"
  | "preview"
  | "production"
  | "unknown";

export type RuntimeOverlayMode = "local_dev" | "disabled" | "missing" | "error";

export type RuntimeRepoOverlay = {
  repo_state_id: string;
  repo: string;
  repo_root_label: string;
  machine: string;
  git_available: boolean;
  branch: string | null;
  head_sha: string | null;
  upstream: string | null;
  upstream_sha: string | null;
  ahead: number | null;
  behind: number | null;
  dirty_tracked_count: number | null;
  untracked_count: number | null;
  deploy_impact: RuntimeDeployImpact;
  live_runtime_role: string;
  notes: string;
};

export type RuntimeSafety = {
  dirty_filenames_included: boolean;
  file_contents_included: boolean;
  health_payloads_included: boolean;
  mode: string;
  secret_values_included: boolean;
};

export type RuntimeAdminEventEnvelope = {
  schema_version: number;
  event_id: string;
  dedupe_key: string;
  source: string;
  provider: string | null;
  account: string | null;
  actor: string;
  kind: string;
  ts: string;
  privacy: string;
  title: string;
  summary: string;
  href: string | null;
  payload_ref: string | null;
  created_by: string;
};

export type RuntimeAdminInboxItem = {
  item_id: string;
  dedupe_key: string;
  event_refs: string[];
  domain?: string;
  entity_ref?: string | null;
  attention_kind?: string;
  source: string;
  account: string | null;
  title: string;
  summary: string;
  href: string | null;
  status: string;
  urgency: string;
  owner: string;
  action_kind: string;
  expires_at: string | null;
  last_seen_at: string | null;
};

export type RuntimeAdminFleetStatus = {
  subject_id: string;
  kind: string;
  title: string;
  status: string;
  summary: string;
  owner: string;
  href: string | null;
  event_refs: string[];
  updated_at: string | null;
};

export type RuntimeAdminCapabilityState = {
  capability_id: string;
  machine: string;
  status: string;
  auth_model: string;
  write_enabled: boolean;
  summary: string;
  event_refs: string[];
  updated_at: string | null;
};

export type RuntimeGmailSentAwareness = {
  events: RuntimeAdminEventEnvelope[];
  projections: {
    inbox_items: RuntimeAdminInboxItem[];
    fleet_status: RuntimeAdminFleetStatus[];
    capability_states: RuntimeAdminCapabilityState[];
  };
  counts: {
    sent: number;
    acknowledgements: number;
    acknowledgement_candidates: number;
  };
};

export type RuntimeOverlayResponse = {
  available: boolean;
  mode: RuntimeOverlayMode;
  generated_at: string | null;
  machine: string | null;
  source_path: string;
  safety: RuntimeSafety | null;
  overlays: RuntimeRepoOverlay[];
  gmail_sent_awareness: RuntimeGmailSentAwareness;
  error?: string;
};

export type RuntimeFeedFile = {
  generated_at?: string;
  machine?: string;
  runtime?: {
    repo_state_overlays?: unknown;
    safety?: unknown;
    gmail_sent_awareness?: unknown;
  };
};

const deployImpacts = new Set<RuntimeDeployImpact>([
  "none",
  "local_only",
  "preview",
  "production",
  "unknown",
]);

export function runtimeOverlayResponseFromFeed(
  feed: unknown,
  sourcePath = RUNTIME_FEED_PATH,
): RuntimeOverlayResponse {
  const file = isRecord(feed) ? (feed as RuntimeFeedFile) : {};
  const runtime = isRecord(file.runtime) ? file.runtime : {};

  return {
    available: true,
    mode: "local_dev",
    generated_at: isString(file.generated_at) ? file.generated_at : null,
    machine: isString(file.machine) ? file.machine : null,
    source_path: sourcePath,
    safety: runtimeSafetyFromJson(runtime.safety),
    overlays: runtimeRepoOverlaysFromJson(runtime.repo_state_overlays),
    gmail_sent_awareness: gmailSentAwarenessFromJson(
      runtime.gmail_sent_awareness,
    ),
  };
}

export function disabledRuntimeOverlayResponse(
  sourcePath = RUNTIME_FEED_PATH,
): RuntimeOverlayResponse {
  return {
    available: false,
    mode: "disabled",
    generated_at: null,
    machine: null,
    source_path: sourcePath,
    safety: null,
    overlays: [],
    gmail_sent_awareness: emptyGmailSentAwareness(),
  };
}

export function runtimeOverlayErrorResponse(
  error: unknown,
  sourcePath = RUNTIME_FEED_PATH,
): RuntimeOverlayResponse {
  const code = isRecord(error) && "code" in error ? String(error.code) : "";

  return {
    ...disabledRuntimeOverlayResponse(sourcePath),
    mode: code === "ENOENT" ? "missing" : "error",
    error:
      error instanceof Error
        ? error.message
        : "unknown runtime feed read failure",
  };
}

export function gmailSentAwarenessFromJson(
  value: unknown,
): RuntimeGmailSentAwareness {
  if (!isRecord(value)) return emptyGmailSentAwareness();
  const projections = isRecord(value.projections) ? value.projections : {};
  const counts = isRecord(value.counts) ? value.counts : {};

  return {
    events: adminEventsFromJson(value.events),
    projections: {
      inbox_items: adminInboxItemsFromJson(projections.inbox_items),
      fleet_status: adminFleetStatusFromJson(projections.fleet_status),
      capability_states: adminCapabilityStatesFromJson(
        projections.capability_states,
      ),
    },
    counts: {
      sent: numberOrZero(counts.sent),
      acknowledgements: numberOrZero(counts.acknowledgements),
      acknowledgement_candidates: numberOrZero(
        counts.acknowledgement_candidates,
      ),
    },
  };
}

function emptyGmailSentAwareness(): RuntimeGmailSentAwareness {
  return {
    events: [],
    projections: {
      inbox_items: [],
      fleet_status: [],
      capability_states: [],
    },
    counts: {
      sent: 0,
      acknowledgements: 0,
      acknowledgement_candidates: 0,
    },
  };
}

function adminEventsFromJson(value: unknown): RuntimeAdminEventEnvelope[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const event = adminEventFromJson(item);
    return event ? [event] : [];
  });
}

function adminEventFromJson(value: unknown): RuntimeAdminEventEnvelope | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.schema_version !== "number" ||
    !isString(value.event_id) ||
    !isString(value.dedupe_key) ||
    !isString(value.source) ||
    !isString(value.actor) ||
    !isString(value.kind) ||
    !isString(value.ts) ||
    !isString(value.privacy) ||
    !isString(value.title) ||
    !isString(value.summary) ||
    !isString(value.created_by)
  ) {
    return null;
  }

  return {
    schema_version: value.schema_version,
    event_id: value.event_id,
    dedupe_key: value.dedupe_key,
    source: value.source,
    provider: stringOrNull(value.provider),
    account: stringOrNull(value.account),
    actor: value.actor,
    kind: value.kind,
    ts: value.ts,
    privacy: value.privacy,
    title: value.title,
    summary: value.summary,
    href: stringOrNull(value.href),
    payload_ref: stringOrNull(value.payload_ref),
    created_by: value.created_by,
  };
}

function adminInboxItemsFromJson(value: unknown): RuntimeAdminInboxItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const inboxItem = adminInboxItemFromJson(item);
    return inboxItem ? [inboxItem] : [];
  });
}

function adminInboxItemFromJson(value: unknown): RuntimeAdminInboxItem | null {
  if (!isRecord(value)) return null;
  if (
    !isString(value.item_id) ||
    !isString(value.dedupe_key) ||
    !isString(value.source) ||
    !isString(value.title) ||
    !isString(value.summary) ||
    !isString(value.status) ||
    !isString(value.urgency) ||
    !isString(value.owner) ||
    !isString(value.action_kind)
  ) {
    return null;
  }

  return {
    item_id: value.item_id,
    dedupe_key: value.dedupe_key,
    event_refs: stringArrayFromJson(value.event_refs),
    domain: isString(value.domain) ? value.domain : undefined,
    entity_ref: stringOrNull(value.entity_ref),
    attention_kind: isString(value.attention_kind)
      ? value.attention_kind
      : undefined,
    source: value.source,
    account: stringOrNull(value.account),
    title: value.title,
    summary: value.summary,
    href: stringOrNull(value.href),
    status: value.status,
    urgency: value.urgency,
    owner: value.owner,
    action_kind: value.action_kind,
    expires_at: stringOrNull(value.expires_at),
    last_seen_at: stringOrNull(value.last_seen_at),
  };
}

function adminFleetStatusFromJson(value: unknown): RuntimeAdminFleetStatus[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const status = adminFleetStatusItemFromJson(item);
    return status ? [status] : [];
  });
}

function adminFleetStatusItemFromJson(
  value: unknown,
): RuntimeAdminFleetStatus | null {
  if (!isRecord(value)) return null;
  if (
    !isString(value.subject_id) ||
    !isString(value.kind) ||
    !isString(value.title) ||
    !isString(value.status) ||
    !isString(value.summary) ||
    !isString(value.owner)
  ) {
    return null;
  }

  return {
    subject_id: value.subject_id,
    kind: value.kind,
    title: value.title,
    status: value.status,
    summary: value.summary,
    owner: value.owner,
    href: stringOrNull(value.href),
    event_refs: stringArrayFromJson(value.event_refs),
    updated_at: stringOrNull(value.updated_at),
  };
}

function adminCapabilityStatesFromJson(
  value: unknown,
): RuntimeAdminCapabilityState[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const state = adminCapabilityStateFromJson(item);
    return state ? [state] : [];
  });
}

function adminCapabilityStateFromJson(
  value: unknown,
): RuntimeAdminCapabilityState | null {
  if (!isRecord(value)) return null;
  if (
    !isString(value.capability_id) ||
    !isString(value.machine) ||
    !isString(value.status) ||
    !isString(value.auth_model) ||
    typeof value.write_enabled !== "boolean" ||
    !isString(value.summary)
  ) {
    return null;
  }

  return {
    capability_id: value.capability_id,
    machine: value.machine,
    status: value.status,
    auth_model: value.auth_model,
    write_enabled: value.write_enabled,
    summary: value.summary,
    event_refs: stringArrayFromJson(value.event_refs),
    updated_at: stringOrNull(value.updated_at),
  };
}

export function runtimeRepoOverlaysFromJson(
  value: unknown,
): RuntimeRepoOverlay[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const overlay = runtimeRepoOverlayFromJson(item);
    return overlay ? [overlay] : [];
  });
}

function runtimeRepoOverlayFromJson(value: unknown): RuntimeRepoOverlay | null {
  if (!isRecord(value)) return null;

  if (
    !isString(value.repo_state_id) ||
    !isString(value.repo) ||
    !isString(value.repo_root_label) ||
    !isString(value.machine) ||
    typeof value.git_available !== "boolean" ||
    !isString(value.live_runtime_role) ||
    !isString(value.notes)
  ) {
    return null;
  }

  return {
    repo_state_id: value.repo_state_id,
    repo: value.repo,
    repo_root_label: value.repo_root_label,
    machine: value.machine,
    git_available: value.git_available,
    branch: stringOrNull(value.branch),
    head_sha: stringOrNull(value.head_sha),
    upstream: stringOrNull(value.upstream),
    upstream_sha: stringOrNull(value.upstream_sha),
    ahead: numberOrNull(value.ahead),
    behind: numberOrNull(value.behind),
    dirty_tracked_count: numberOrNull(value.dirty_tracked_count),
    untracked_count: numberOrNull(value.untracked_count),
    deploy_impact: deployImpactFromJson(value.deploy_impact),
    live_runtime_role: value.live_runtime_role,
    notes: value.notes,
  };
}

function runtimeSafetyFromJson(value: unknown): RuntimeSafety | null {
  if (!isRecord(value)) return null;

  if (
    typeof value.dirty_filenames_included !== "boolean" ||
    typeof value.file_contents_included !== "boolean" ||
    typeof value.health_payloads_included !== "boolean" ||
    typeof value.secret_values_included !== "boolean" ||
    !isString(value.mode)
  ) {
    return null;
  }

  return {
    dirty_filenames_included: value.dirty_filenames_included,
    file_contents_included: value.file_contents_included,
    health_payloads_included: value.health_payloads_included,
    mode: value.mode,
    secret_values_included: value.secret_values_included,
  };
}

function deployImpactFromJson(value: unknown): RuntimeDeployImpact {
  return isString(value) && deployImpacts.has(value as RuntimeDeployImpact)
    ? (value as RuntimeDeployImpact)
    : "unknown";
}

function stringOrNull(value: unknown): string | null {
  return isString(value) ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringArrayFromJson(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => isString(item))
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
