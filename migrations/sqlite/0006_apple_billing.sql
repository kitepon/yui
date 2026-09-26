CREATE TABLE IF NOT EXISTS apple_billing_accounts (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  app_account_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS apple_subscriptions (
  original_transaction_id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  transaction_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  status INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  grace_expires_at_ms INTEGER,
  revoked_at_ms INTEGER,
  auto_renew_status INTEGER,
  offer_discount_type TEXT,
  state_as_of_ms INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS apple_subscriptions_user_id ON apple_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS apple_notification_events (
  id TEXT NOT NULL PRIMARY KEY,
  received_at TEXT NOT NULL
);
