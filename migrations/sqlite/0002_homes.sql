CREATE TABLE IF NOT EXISTS homes (
  id TEXT NOT NULL PRIMARY KEY,
  owner_user_id TEXT NOT NULL UNIQUE,
  pair_pin TEXT NOT NULL,
  credentials_enc TEXT NOT NULL,
  body_json TEXT NOT NULL,
  has_enabled_automation INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS homes_automation_idx ON homes (has_enabled_automation);
