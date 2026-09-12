CREATE TABLE IF NOT EXISTS home_samples (
  home_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  device_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  PRIMARY KEY (home_id, ts, device_id, metric),
  FOREIGN KEY (home_id) REFERENCES homes (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS home_samples_home_ts ON home_samples (home_id, ts);

CREATE TABLE IF NOT EXISTS home_events (
  id TEXT NOT NULL PRIMARY KEY,
  home_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  wave_id TEXT NOT NULL,
  source TEXT NOT NULL,
  automation_id TEXT,
  automation_name TEXT,
  device_id TEXT,
  device_name TEXT,
  outcome TEXT NOT NULL,
  reason TEXT,
  detail TEXT,
  FOREIGN KEY (home_id) REFERENCES homes (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS home_events_home_ts ON home_events (home_id, ts);
CREATE INDEX IF NOT EXISTS home_events_skip ON home_events (home_id, automation_id, device_id, ts);
