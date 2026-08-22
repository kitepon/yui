CREATE TABLE IF NOT EXISTS alexa_auth_codes (
  code TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alexa_tokens (
  access_token TEXT NOT NULL PRIMARY KEY,
  refresh_token TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
