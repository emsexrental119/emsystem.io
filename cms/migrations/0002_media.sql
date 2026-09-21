CREATE TABLE IF NOT EXISTS media (
  name TEXT PRIMARY KEY,
  bytes BLOB NOT NULL,
  content_type TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
