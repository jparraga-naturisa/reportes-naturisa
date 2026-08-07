-- Tabla compartida de piscinas, usable desde cualquier dashboard/proyecto
-- via GET https://<tu-worker>.workers.dev/db/piscinas

CREATE TABLE IF NOT EXISTS piscinas (
  id_pool       INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  code_pool     TEXT,
  size          REAL,
  subsidiary_id INTEGER,
  type          TEXT,
  status        TEXT,
  updated_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_piscinas_subsidiary ON piscinas(subsidiary_id);
