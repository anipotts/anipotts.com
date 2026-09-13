-- Dedicated CONTENT_DB only. Apply after 0001 through the migration ledger.
-- DEFAULT 1 classifies existing snapshots and preserves named-column v1 writers.
-- No authored source, receipt, pointer or inventory version is rewritten.
ALTER TABLE editorial_published_revisions
  ADD COLUMN content_schema_version INTEGER NOT NULL DEFAULT 1
  CHECK(content_schema_version > 0);
