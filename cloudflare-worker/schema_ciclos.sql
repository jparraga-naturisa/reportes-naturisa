-- Tabla compartida de ciclos de produccion (desde 2025-01-01), usable desde
-- cualquier dashboard/proyecto via GET https://<tu-worker>.workers.dev/db/ciclos

CREATE TABLE IF NOT EXISTS ciclos (
  cycle_id       INTEGER PRIMARY KEY,
  subsidiary_id  INTEGER,
  subsidiary_code TEXT,
  pool_name      TEXT,
  cycle_number   INTEGER,
  cycle_code     TEXT,
  cycle_usage    TEXT,
  date_sowing    TEXT,
  pool_size      REAL,
  estado         TEXT,
  days_cycle     INTEGER,
  days_dry       INTEGER,
  days_production INTEGER,
  start_date     TEXT,
  harvest_date   TEXT,
  updated_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_ciclos_subsidiary ON ciclos(subsidiary_id);
CREATE INDEX IF NOT EXISTS idx_ciclos_estado ON ciclos(estado);
