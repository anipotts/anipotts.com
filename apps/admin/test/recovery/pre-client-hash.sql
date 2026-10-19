-- Exact identity table from 14d124914^, upgraded by the current constructor.
      CREATE TABLE IF NOT EXISTS save_request_identities (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        payloadHash TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('saved', 'conflict')),
        revision INTEGER,
        legacyResult TEXT
      );
