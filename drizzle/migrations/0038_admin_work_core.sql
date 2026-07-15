ALTER TABLE admin_inbox_items
  ADD COLUMN domain TEXT NOT NULL DEFAULT 'general';

ALTER TABLE admin_inbox_items
  ADD COLUMN entity_ref TEXT;

ALTER TABLE admin_inbox_items
  ADD COLUMN attention_kind TEXT NOT NULL DEFAULT 'awareness';

CREATE TABLE IF NOT EXISTS admin_project_states (
  project_id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  domain TEXT NOT NULL,
  entity_ref TEXT,
  lifecycle TEXT NOT NULL,
  attention_kind TEXT NOT NULL,
  native_runtime_status TEXT NOT NULL,
  status_summary TEXT NOT NULL,
  owner TEXT NOT NULL,
  agent_source TEXT NOT NULL,
  event_refs TEXT NOT NULL DEFAULT '[]',
  task_refs TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_project_domain_lifecycle
  ON admin_project_states (domain, lifecycle);

CREATE INDEX IF NOT EXISTS idx_admin_project_attention
  ON admin_project_states (attention_kind);

CREATE TABLE IF NOT EXISTS admin_task_states (
  task_id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  project_ref TEXT NOT NULL,
  title TEXT NOT NULL,
  domain TEXT NOT NULL,
  entity_ref TEXT,
  lifecycle TEXT NOT NULL,
  attention_kind TEXT NOT NULL,
  native_runtime_status TEXT NOT NULL,
  status_summary TEXT NOT NULL,
  owner TEXT NOT NULL,
  agent_source TEXT NOT NULL,
  event_refs TEXT NOT NULL DEFAULT '[]',
  blocked_by TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_task_project
  ON admin_task_states (project_ref, lifecycle);

CREATE INDEX IF NOT EXISTS idx_admin_task_attention
  ON admin_task_states (attention_kind);

CREATE TABLE IF NOT EXISTS admin_task_lineage (
  lineage_id TEXT PRIMARY KEY,
  task_ref TEXT NOT NULL,
  parent_task_ref TEXT,
  root_task_ref TEXT NOT NULL,
  relation TEXT NOT NULL,
  agent_source TEXT NOT NULL,
  event_refs TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_task_lineage_task
  ON admin_task_lineage (task_ref);

CREATE INDEX IF NOT EXISTS idx_admin_task_lineage_root
  ON admin_task_lineage (root_task_ref);
