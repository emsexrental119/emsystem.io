CREATE TABLE IF NOT EXISTS quote_pricing (
 id INTEGER PRIMARY KEY CHECK(id=1),
 config_json TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
