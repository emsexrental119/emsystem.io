CREATE TABLE IF NOT EXISTS quote_company_templates (
 company TEXT PRIMARY KEY,
 xlsx_base64 TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
