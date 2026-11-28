-- yui:foreign-keys-off
-- Hosted login on the shared library (docs/hosted-login-billing-contract.md): the owner of a home is an entry id there, not a "user" row,
-- so homes and the two Alexa tables lose their foreign key to "user". The trigger below keeps the self-hosted cascade exactly as it was.
CREATE TABLE homes_new (
  id TEXT NOT NULL PRIMARY KEY,
  owner_user_id TEXT NOT NULL UNIQUE,
  pair_pin TEXT NOT NULL,
  credentials_enc TEXT NOT NULL,
  body_json TEXT NOT NULL,
  has_enabled_automation INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  paid_until INTEGER,
  orphaned_at INTEGER
);
INSERT INTO homes_new (id, owner_user_id, pair_pin, credentials_enc, body_json, has_enabled_automation, created_at, updated_at)
  SELECT id, owner_user_id, pair_pin, credentials_enc, body_json, has_enabled_automation, created_at, updated_at FROM homes;
DROP TABLE homes;
ALTER TABLE homes_new RENAME TO homes;
CREATE INDEX IF NOT EXISTS homes_automation_idx ON homes (has_enabled_automation);

CREATE TABLE alexa_auth_codes_new (
  code TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
INSERT INTO alexa_auth_codes_new SELECT code, user_id, redirect_uri, expires_at FROM alexa_auth_codes;
DROP TABLE alexa_auth_codes;
ALTER TABLE alexa_auth_codes_new RENAME TO alexa_auth_codes;

CREATE TABLE alexa_tokens_new (
  access_token TEXT NOT NULL PRIMARY KEY,
  refresh_token TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
INSERT INTO alexa_tokens_new SELECT access_token, refresh_token, user_id, expires_at FROM alexa_tokens;
DROP TABLE alexa_tokens;
ALTER TABLE alexa_tokens_new RENAME TO alexa_tokens;

CREATE TRIGGER user_delete_owned_rows AFTER DELETE ON "user"
BEGIN
  DELETE FROM homes WHERE owner_user_id = OLD.id;
  DELETE FROM alexa_tokens WHERE user_id = OLD.id;
  DELETE FROM alexa_auth_codes WHERE user_id = OLD.id;
END;

CREATE TABLE keyholes (
  key TEXT NOT NULL PRIMARY KEY,
  entry TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('parent', 'child'))
);
CREATE INDEX keyholes_entry_idx ON keyholes (entry);
CREATE TABLE keyhole_used (id TEXT NOT NULL PRIMARY KEY, until_ms INTEGER NOT NULL);
CREATE TABLE link_codes (
  code_hash TEXT NOT NULL PRIMARY KEY,
  entry_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX link_codes_entry_idx ON link_codes (entry_id);
