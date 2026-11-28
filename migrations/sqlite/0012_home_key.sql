-- The home key, wrapped by the authentication module (docs/yui-management.md). One row; written in the same transaction as the re-encryption that it belongs to.
CREATE TABLE IF NOT EXISTS home_key (
  id INTEGER NOT NULL PRIMARY KEY CHECK (id = 1),
  wrapped TEXT NOT NULL,
  aad TEXT NOT NULL,
  rotated_at TEXT NOT NULL
);
