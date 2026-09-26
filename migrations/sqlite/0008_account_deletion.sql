CREATE TABLE IF NOT EXISTS apple_deleted_transactions (
  original_transaction_id TEXT NOT NULL PRIMARY KEY,
  deleted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS apple_login_tokens (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  refresh_token_enc TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deleted_users (
  user_id TEXT NOT NULL PRIMARY KEY,
  deleted_at TEXT NOT NULL
);
