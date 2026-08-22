CREATE TABLE IF NOT EXISTS billing_customers (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id TEXT NOT NULL PRIMARY KEY,
  type TEXT NOT NULL,
  received_at TEXT NOT NULL
);
