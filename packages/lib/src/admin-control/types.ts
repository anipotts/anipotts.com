export const ADMIN_EVENT_SCHEMA_VERSION = 1;

export type AdminControlSourceMode = "d1" | "fixture" | "mixed";

export type AdminEventPrivacy = "public" | "internal" | "private" | "sensitive";

export interface AdminEventEnvelope {
  schema_version: number;
  event_id: string;
  dedupe_key: string;
  source: string;
  provider: string | null;
  account: string | null;
  actor: string;
  kind: string;
  ts: string;
  privacy: AdminEventPrivacy | string;
  title: string;
  summary: string;
  href: string | null;
  payload_ref: string | null;
  created_by: string;
}

export type InboxActionKind =
  | "approve"
  | "review"
  | "verify"
  | "decide"
  | "deadline"
  | "open"
  | "none";

export type AdminAttentionKind =
  | "approval"
  | "decision"
  | "deadline"
  | "error"
  | "review"
  | "verification";

export type AdminAgentSource = "ani" | "codex" | "claude" | "system" | "mixed";

export type AdminLifecycleState =
  | "active"
  | "archived"
  | "blocked"
  | "complete"
  | "draft"
  | "parked"
  | "planned"
  | "ready"
  | "review";

export type AdminNativeRuntimeStatus =
  | "notLoaded"
  | "idle"
  | "active"
  | "systemError";

export type AdminCanonicalHostRole =
  | "source"
  | "runtime"
  | "mirror"
  | "archive"
  | "scratch";

export interface AdminInboxItem {
  item_id: string;
  dedupe_key: string;
  event_refs: string[];
  domain: string;
  entity_ref: string | null;
  attention_kind: AdminAttentionKind | string;
  source: string;
  account: string | null;
  title: string;
  summary: string;
  href: string | null;
  status: string;
  urgency: "low" | "normal" | "high" | "urgent" | string;
  owner: string;
  action_kind: InboxActionKind | string;
  expires_at: string | null;
  last_seen_at: string | null;
}

export type AdminSentMailAttachmentPresence = boolean | "unknown";

export interface AdminSentMailMetadata {
  account: string;
  sent_ref: string;
  subject: string;
  sent_at: string;
  has_attachments: AdminSentMailAttachmentPresence;
  href: string | null;
}

export type PieceStateName =
  | "idea"
  | "draft"
  | "review"
  | "export-ready"
  | "publish-ready"
  | "published"
  | "archived";

export interface AdminPieceState {
  piece_id: string;
  dedupe_key: string;
  event_refs: string[];
  title: string;
  state: PieceStateName | string;
  channels: string[];
  source_refs: string[];
  updated_at: string | null;
}

export interface AdminProjectState {
  project_id: string;
  dedupe_key: string;
  project_key: string;
  display_name: string;
  domain: string;
  entity_ref: string | null;
  owner_chief: string;
  repository: string;
  canonical_remote: string;
  pro_path: string | null;
  mini_path: string | null;
  canonical_host_role: AdminCanonicalHostRole | string;
  lifecycle: AdminLifecycleState | string;
  attention_kind: AdminAttentionKind | string;
  last_observed_at: string | null;
  agent_source: AdminAgentSource | string;
  event_refs: string[];
  task_refs: string[];
}

export interface AdminTaskState {
  task_id: string;
  dedupe_key: string;
  native_thread_id: string | null;
  machine: string;
  host: string;
  project_ref: string;
  cwd: string;
  goal: string;
  current_summary: string;
  final_summary: string | null;
  next_action: string;
  proof_refs: string[];
  lifecycle: AdminLifecycleState | string;
  attention_kind: AdminAttentionKind | string;
  native_runtime_status: AdminNativeRuntimeStatus | string;
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
  agent_source: AdminAgentSource | string;
  event_refs: string[];
  blocked_by: string[];
}

export interface AdminTaskLineage {
  lineage_id: string;
  lineage_group_id: string;
  task_ref: string;
  parent_task_ref: string | null;
  root_task_ref: string;
  relation: string;
  controller_ref: string | null;
  agent_source: AdminAgentSource | string;
  event_refs: string[];
  updated_at: string | null;
}

export interface AdminFleetStatus {
  subject_id: string;
  kind: string;
  title: string;
  status: string;
  summary: string;
  owner: string;
  href: string | null;
  event_refs: string[];
  updated_at: string | null;
}

export interface AdminDeployState {
  deploy_id: string;
  target: string;
  status: string;
  scope: string;
  href: string | null;
  last_run_at: string | null;
  event_refs: string[];
  updated_at: string | null;
}

export interface AdminCapabilityState {
  capability_id: string;
  machine: string;
  status: string;
  auth_model: string;
  write_enabled: boolean;
  summary: string;
  event_refs: string[];
  updated_at: string | null;
}

export interface AdminServiceRegistryViewItem {
  service_id: string;
  name: string;
  hostname: string;
  visibility: string;
  owner: string;
  status: string;
  updated_at: string | null;
  event_refs: string[];
}

export interface AdminControlRetention {
  event_store: "d1";
  payload_store: "r2";
  payload_ref_required: boolean;
  archive_target: "r2";
  archive_policy: string;
}

export interface AdminControlSyncContract {
  v1: "refresh-on-open-plus-light-polling";
  push_swappable: true;
  target: "durable-objects-websocket-hibernation";
}

export interface AdminControlAuthContract {
  ui: "passkey-session";
  mcp: "cloudflare-access-service-token-per-machine";
  write_tools: "disabled-until-broker-and-signed-connect-diff";
}

export interface AdminControlContracts {
  event_fields: (keyof AdminEventEnvelope)[];
  inbox_card_fields: (keyof AdminInboxItem)[];
  project_state_fields: (keyof AdminProjectState)[];
  task_state_fields: (keyof AdminTaskState)[];
  task_lineage_fields: (keyof AdminTaskLineage)[];
  sent_mail_metadata_fields: (keyof AdminSentMailMetadata)[];
  sent_mail_card_policy: {
    dedupe: "gmail-message-id-derived-ref";
    completed_obligation: "event-only";
    followups: "separate-inbox-items";
    sync: "refresh-on-open-plus-light-polling";
    raw_identifiers: "omitted";
    preview_text: "omitted";
  };
  piece_states: PieceStateName[];
  legal_piece_cycles: string[];
}

export interface AdminControlProjections {
  inbox_items: AdminInboxItem[];
  project_states: AdminProjectState[];
  task_states: AdminTaskState[];
  task_lineage: AdminTaskLineage[];
  piece_states: AdminPieceState[];
  fleet_status: AdminFleetStatus[];
  deploy_states: AdminDeployState[];
  capability_states: AdminCapabilityState[];
  service_registry_view: AdminServiceRegistryViewItem[];
}

export interface AdminControlSnapshot {
  schema_version: number;
  generated_at: string;
  source_mode: AdminControlSourceMode;
  sync: AdminControlSyncContract;
  retention: AdminControlRetention;
  auth: AdminControlAuthContract;
  contracts: AdminControlContracts;
  events: AdminEventEnvelope[];
  projections: AdminControlProjections;
  errors: string[];
}
