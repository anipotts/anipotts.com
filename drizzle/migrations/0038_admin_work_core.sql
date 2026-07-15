ALTER TABLE admin_inbox_items
  ADD COLUMN domain TEXT NOT NULL DEFAULT 'general';

ALTER TABLE admin_inbox_items
  ADD COLUMN entity_ref TEXT;

ALTER TABLE admin_inbox_items
  ADD COLUMN attention_kind TEXT NOT NULL DEFAULT 'review';

CREATE TABLE IF NOT EXISTS admin_project_states (
  project_id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  project_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  domain TEXT NOT NULL,
  entity_ref TEXT,
  owner_chief TEXT NOT NULL,
  repository TEXT NOT NULL,
  canonical_remote TEXT NOT NULL,
  pro_path TEXT,
  mini_path TEXT,
  canonical_host_role TEXT NOT NULL,
  lifecycle TEXT NOT NULL,
  attention_kind TEXT NOT NULL,
  last_observed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  agent_source TEXT NOT NULL,
  event_refs TEXT NOT NULL DEFAULT '[]',
  task_refs TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_admin_project_domain_lifecycle
  ON admin_project_states (domain, lifecycle);

CREATE INDEX IF NOT EXISTS idx_admin_project_attention
  ON admin_project_states (attention_kind);

CREATE INDEX IF NOT EXISTS idx_admin_project_owner
  ON admin_project_states (owner_chief);

CREATE TABLE IF NOT EXISTS admin_task_states (
  task_id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  native_thread_id TEXT,
  machine TEXT NOT NULL,
  host TEXT NOT NULL,
  project_ref TEXT NOT NULL,
  cwd TEXT NOT NULL,
  goal TEXT NOT NULL,
  current_summary TEXT NOT NULL,
  final_summary TEXT,
  next_action TEXT NOT NULL,
  proof_refs TEXT NOT NULL DEFAULT '[]',
  lifecycle TEXT NOT NULL,
  attention_kind TEXT NOT NULL,
  native_runtime_status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT,
  agent_source TEXT NOT NULL,
  event_refs TEXT NOT NULL DEFAULT '[]',
  blocked_by TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_admin_task_project
  ON admin_task_states (project_ref, lifecycle);

CREATE INDEX IF NOT EXISTS idx_admin_task_attention
  ON admin_task_states (attention_kind);

CREATE TABLE IF NOT EXISTS admin_task_lineage (
  lineage_id TEXT PRIMARY KEY,
  lineage_group_id TEXT NOT NULL,
  task_ref TEXT NOT NULL,
  parent_task_ref TEXT,
  root_task_ref TEXT NOT NULL,
  relation TEXT NOT NULL,
  controller_ref TEXT,
  agent_source TEXT NOT NULL,
  event_refs TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_task_lineage_task
  ON admin_task_lineage (task_ref);

CREATE INDEX IF NOT EXISTS idx_admin_task_lineage_root
  ON admin_task_lineage (root_task_ref);

CREATE INDEX IF NOT EXISTS idx_admin_task_lineage_group
  ON admin_task_lineage (lineage_group_id);
