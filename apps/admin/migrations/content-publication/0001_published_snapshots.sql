-- Dedicated CONTENT_DB only. Do not apply to anipotts-db.
-- Public snapshots only; drafts and private media never belong in this database.

CREATE TABLE IF NOT EXISTS editorial_published_inventory (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), version INTEGER NOT NULL CHECK(version >= 0));

INSERT OR IGNORE INTO editorial_published_inventory (singleton,version) VALUES (1,0);

CREATE TABLE IF NOT EXISTS editorial_published_revisions (
    publication_id TEXT PRIMARY KEY, record_kind TEXT NOT NULL, record_id TEXT NOT NULL,
    source TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0),
    source_sha256 TEXT NOT NULL, published_at TEXT NOT NULL, expected_publication_id TEXT, expected_inventory_version INTEGER NOT NULL
  );

CREATE TRIGGER IF NOT EXISTS editorial_published_revisions_no_update
    BEFORE UPDATE ON editorial_published_revisions BEGIN
    SELECT RAISE(ABORT, 'published revisions are immutable'); END;

CREATE TRIGGER IF NOT EXISTS editorial_published_revisions_no_delete
    BEFORE DELETE ON editorial_published_revisions BEGIN
    SELECT RAISE(ABORT, 'published revisions are immutable'); END;

CREATE INDEX IF NOT EXISTS editorial_published_record_history ON editorial_published_revisions(record_kind, record_id, published_at);

CREATE TABLE IF NOT EXISTS editorial_published_active (
    record_kind TEXT NOT NULL, record_id TEXT NOT NULL, publication_id TEXT NOT NULL UNIQUE,
    PRIMARY KEY(record_kind, record_id),
    FOREIGN KEY(publication_id) REFERENCES editorial_published_revisions(publication_id)
  );
