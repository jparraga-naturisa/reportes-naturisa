-- Tabla compartida de piscinas, usable desde cualquier dashboard/proyecto
-- via GET https://<tu-worker>.workers.dev/db/piscinas
-- via GET https://<tu-worker>.workers.dev/db/layers  (con ciclo activo y polígono)

CREATE TABLE IF NOT EXISTS piscinas (
  id_piscina    INTEGER PRIMARY KEY,
  nombre        TEXT NOT NULL,
  codigo_piscina TEXT,
  tamano        REAL,
  id_sucursal   INTEGER,
  tipo          TEXT,
  estado        TEXT,
  poligono      TEXT,   -- JSON [[lat,lng], ...] sincronizado desde AP1 /maps/layers cada 6h
  actualizado_en TEXT
);

CREATE INDEX IF NOT EXISTS idx_piscinas_sucursal ON piscinas(id_sucursal);
CREATE INDEX IF NOT EXISTS idx_piscinas_codigo   ON piscinas(codigo_piscina);

-- Migración: agregar columna poligono si ya existe la tabla sin ella
-- Ejecutar una sola vez en D1 Studio:
--   ALTER TABLE piscinas ADD COLUMN poligono TEXT;
