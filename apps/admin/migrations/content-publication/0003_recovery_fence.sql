-- Inactive source migration only. Applying it enrolls every cooperating writer.
-- A capture requires zero unresolved writers; records never expire by time.
CREATE TABLE editorial_recovery_control (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), generation INTEGER NOT NULL CHECK(generation>=0),
 phase TEXT NOT NULL CHECK(phase IN ('open','draining','suspended')), capture_id TEXT
);
INSERT INTO editorial_recovery_control VALUES (1,0,'open',NULL);
CREATE TABLE editorial_recovery_writers (
 token TEXT PRIMARY KEY, generation INTEGER NOT NULL, kind TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state='active')
);
CREATE TRIGGER editorial_published_inventory_recovery_insert BEFORE INSERT ON editorial_published_inventory WHEN COALESCE((SELECT phase FROM editorial_recovery_control WHERE singleton=1),'missing') != 'open' BEGIN SELECT RAISE(ABORT,'recovery_write_fenced'); END;
CREATE TRIGGER editorial_published_inventory_recovery_update BEFORE UPDATE ON editorial_published_inventory WHEN COALESCE((SELECT phase FROM editorial_recovery_control WHERE singleton=1),'missing') != 'open' BEGIN SELECT RAISE(ABORT,'recovery_write_fenced'); END;
CREATE TRIGGER editorial_published_inventory_recovery_delete BEFORE DELETE ON editorial_published_inventory WHEN COALESCE((SELECT phase FROM editorial_recovery_control WHERE singleton=1),'missing') != 'open' BEGIN SELECT RAISE(ABORT,'recovery_write_fenced'); END;
CREATE TRIGGER editorial_published_revisions_recovery_insert BEFORE INSERT ON editorial_published_revisions WHEN COALESCE((SELECT phase FROM editorial_recovery_control WHERE singleton=1),'missing') != 'open' BEGIN SELECT RAISE(ABORT,'recovery_write_fenced'); END;
CREATE TRIGGER editorial_published_revisions_recovery_update BEFORE UPDATE ON editorial_published_revisions WHEN COALESCE((SELECT phase FROM editorial_recovery_control WHERE singleton=1),'missing') != 'open' BEGIN SELECT RAISE(ABORT,'recovery_write_fenced'); END;
CREATE TRIGGER editorial_published_revisions_recovery_delete BEFORE DELETE ON editorial_published_revisions WHEN COALESCE((SELECT phase FROM editorial_recovery_control WHERE singleton=1),'missing') != 'open' BEGIN SELECT RAISE(ABORT,'recovery_write_fenced'); END;
CREATE TRIGGER editorial_published_active_recovery_insert BEFORE INSERT ON editorial_published_active WHEN COALESCE((SELECT phase FROM editorial_recovery_control WHERE singleton=1),'missing') != 'open' BEGIN SELECT RAISE(ABORT,'recovery_write_fenced'); END;
CREATE TRIGGER editorial_published_active_recovery_update BEFORE UPDATE ON editorial_published_active WHEN COALESCE((SELECT phase FROM editorial_recovery_control WHERE singleton=1),'missing') != 'open' BEGIN SELECT RAISE(ABORT,'recovery_write_fenced'); END;
CREATE TRIGGER editorial_published_active_recovery_delete BEFORE DELETE ON editorial_published_active WHEN COALESCE((SELECT phase FROM editorial_recovery_control WHERE singleton=1),'missing') != 'open' BEGIN SELECT RAISE(ABORT,'recovery_write_fenced'); END;
