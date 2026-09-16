-- 0044_copy_agents_project_page_content.sql
-- The claude-code-tips project is now the agents project at /work/agents,
-- with its source at github.com/anipotts/agents.
--
-- Copy the retained legacy D1 detail record and its preview operation under the
-- new key. The copies take the current rows as their base, so later edits and
-- the 0033 and 0036 column changes carry over. Only the identity, title, links
-- and route fields change.
--
-- Additive only. The project:claude-code-tips rows stay in place as history.
-- The public site renders from content/public/projects/agents.md and reads
-- neither table. Admin shows these rows as read-only legacy diagnostics, and
-- scripts/admin/content-proof.mjs checks for them.
--
-- Rollback (manual, needs Ani's approval because it removes rows): remove
-- page_content id 'page-project-agents-v1-2026-09-16' and
-- content_draft_operations operation_id
-- 'content-draft-project-agents-detail-2026-06-29'. The public site is
-- unaffected either way.

INSERT OR IGNORE INTO page_content (
  id,
  page_key,
  content,
  version,
  published,
  updated_at,
  updated_by,
  created_at,
  version_history
)
SELECT
  'page-project-agents-v1-2026-09-16',
  'project:agents',
  json_set(
    content,
    '$.slug', 'agents',
    '$.title', 'agents',
    '$.links', json('[{"label":"source","url":"https://github.com/anipotts/agents"},{"label":"live","url":"https://agents.anipotts.com"}]')
  ),
  1,
  1,
  '2026-09-16T00:00:00Z',
  'agent',
  '2026-09-16T00:00:00Z',
  json_array(
    json_object(
      'event', 'copied',
      'source', 'drizzle/migrations/0044_copy_agents_project_page_content.sql',
      'from_id', id,
      'from_page_key', page_key,
      'from_version', version,
      'summary', 'Copied project:claude-code-tips to project:agents with the renamed slug, title and repository link.'
    )
  )
FROM page_content
WHERE page_key = 'project:claude-code-tips'
  AND published = 1
ORDER BY version DESC, updated_at DESC
LIMIT 1;

INSERT OR IGNORE INTO content_draft_operations (
  operation_id,
  kind,
  surface,
  route,
  source_ref,
  field_path,
  current_value_ref,
  proposed_value,
  status,
  risk_level,
  authority_state,
  required_approval_ids,
  allowed_actions,
  forbidden_actions,
  preview_targets,
  proof_ids,
  evidence_uri,
  redaction,
  created_by,
  created_at,
  updated_at,
  expires_at,
  rollback_ref,
  reviewer_note,
  metadata,
  page_key,
  slug,
  title,
  visibility,
  updated_by,
  published_from_operation_id
)
SELECT
  'content-draft-project-agents-detail-2026-06-29',
  kind,
  surface,
  '/work/agents',
  'content/public/projects/agents.md',
  'projects.agents.detail',
  'published_page_content:project:agents',
  'Review future edits to the agents title, summary, body, links, tags, and visibility before proposing a source-controlled canonical change.',
  status,
  risk_level,
  authority_state,
  required_approval_ids,
  allowed_actions,
  forbidden_actions,
  '["/content/review","/content/preview","/work/agents"]',
  '["content.projects.agents.page-content","admin.content.preview.d1"]',
  'repo://content/public/projects/agents.md',
  redaction,
  created_by,
  created_at,
  '2026-09-16T00:00:00Z',
  expires_at,
  'source_markdown:content/public/projects/agents.md',
  reviewer_note,
  json_set(
    CASE WHEN json_valid(metadata) THEN metadata ELSE '{}' END,
    '$.source_migration', 'drizzle/migrations/0044_copy_agents_project_page_content.sql',
    '$.copied_from_operation_id', operation_id
  ),
  CASE WHEN page_key IS NULL THEN NULL ELSE 'project:agents' END,
  CASE WHEN slug IS NULL THEN NULL ELSE 'agents' END,
  CASE WHEN title IS NULL THEN NULL ELSE 'agents' END,
  visibility,
  updated_by,
  published_from_operation_id
FROM content_draft_operations
WHERE operation_id = 'content-draft-project-claude-code-tips-detail-2026-06-29';
