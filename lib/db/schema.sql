CREATE TABLE IF NOT EXISTS targets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  collector_id TEXT NOT NULL,
  active_contract_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id TEXT NOT NULL REFERENCES targets(id),
  version INTEGER NOT NULL,
  spec_json TEXT NOT NULL,
  created_by TEXT NOT NULL CHECK (created_by IN ('seed','studio','fallback')),
  parent_version INTEGER,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (target_id, version)
);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id TEXT NOT NULL REFERENCES targets(id),
  contract_version INTEGER NOT NULL,
  snapshot_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','ok','drift','healed','failed')),
  record_count INTEGER NOT NULL DEFAULT 0,
  raw_payload TEXT,
  error TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  key TEXT NOT NULL,
  title TEXT,
  price REAL,
  currency TEXT,
  in_stock INTEGER,
  url TEXT
);
CREATE INDEX IF NOT EXISTS idx_records_run ON records(run_id);

CREATE TABLE IF NOT EXISTS drift_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  severity TEXT NOT NULL CHECK (severity IN ('warn','critical')),
  signals_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS heal_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drift_event_id INTEGER NOT NULL REFERENCES drift_events(id),
  from_version INTEGER NOT NULL,
  to_version INTEGER,
  status TEXT NOT NULL CHECK (status IN ('proposed','validated','promoted','rejected','failed')),
  source TEXT NOT NULL CHECK (source IN ('studio','fallback')),
  heal_prompt TEXT,
  proposal_json TEXT,
  validation_report_json TEXT,
  cli_action TEXT CHECK (cli_action IN ('approve','reject','none')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fixtures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id TEXT NOT NULL REFERENCES targets(id),
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  expected_assertions_json TEXT NOT NULL,
  golden_keys_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mirror_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  profile TEXT NOT NULL DEFAULT 'pristine',
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO mirror_state (id, profile) VALUES (1, 'pristine');
