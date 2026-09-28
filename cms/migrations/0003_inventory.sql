CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  items_json TEXT NOT NULL DEFAULT '[]',
  revision INTEGER NOT NULL DEFAULT 1,
  share_token TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS inventory_history (
  revision INTEGER PRIMARY KEY,
  items_json TEXT NOT NULL,
  actor TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
