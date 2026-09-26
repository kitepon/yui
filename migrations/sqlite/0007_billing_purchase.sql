CREATE TABLE IF NOT EXISTS billing_purchase_attempts (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  attempt_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'apple')),
  stripe_session_id TEXT,
  expires_at_ms INTEGER,
  created_at TEXT NOT NULL
);
