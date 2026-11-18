CREATE TABLE IF NOT EXISTS editorial_drafts (store TEXT NOT NULL,key TEXT NOT NULL,source TEXT NOT NULL,baseCommit TEXT NOT NULL,baseFileHash TEXT,revision INTEGER NOT NULL,updatedAt INTEGER NOT NULL,discardedAt INTEGER,PRIMARY KEY(store,key));
CREATE TABLE IF NOT EXISTS editorial_draft_history (store TEXT NOT NULL,key TEXT NOT NULL,revision INTEGER NOT NULL,snapshot TEXT NOT NULL,PRIMARY KEY(store,key,revision));
CREATE TRIGGER IF NOT EXISTS editorial_draft_history_no_delete BEFORE DELETE ON editorial_draft_history BEGIN SELECT RAISE(ABORT,'draft history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS editorial_draft_history_no_update BEFORE UPDATE ON editorial_draft_history BEGIN SELECT RAISE(ABORT,'draft history is immutable'); END;
CREATE TABLE IF NOT EXISTS editorial_draft_conflicts (store TEXT NOT NULL,id TEXT NOT NULL,key TEXT NOT NULL,source TEXT NOT NULL,expectedRevision INTEGER NOT NULL,createdAt INTEGER NOT NULL,PRIMARY KEY(store,id));
CREATE TABLE IF NOT EXISTS editorial_draft_requests (store TEXT NOT NULL,id TEXT NOT NULL,key TEXT NOT NULL,payloadHash TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(store,id));
CREATE TABLE IF NOT EXISTS editorial_draft_identities (store TEXT NOT NULL,id TEXT NOT NULL,key TEXT NOT NULL,payloadHash TEXT NOT NULL,clientHash TEXT,outcome TEXT NOT NULL,revision INTEGER,legacyResult TEXT,PRIMARY KEY(store,id));
CREATE TABLE IF NOT EXISTS editorial_draft_bases (store TEXT NOT NULL,key TEXT NOT NULL,publicationId TEXT NOT NULL,inventoryVersion INTEGER NOT NULL,PRIMARY KEY(store,key));
CREATE TABLE IF NOT EXISTS editorial_draft_imports (store TEXT PRIMARY KEY,completedAt INTEGER NOT NULL,counts TEXT NOT NULL);
