-- Nombres de centro de costo desde Data Maestra (AP1), para no depender de que
-- el navegador llame a AP1 directamente. Se refresca en el cron liviano.
CREATE TABLE IF NOT EXISTS centro_costo (
  codigo            TEXT NOT NULL PRIMARY KEY,
  nombre            TEXT,
  codigo_sucursal   TEXT,
  id_compania       TEXT,
  orden_control     TEXT,
  actualizado_en    TEXT
);

-- Agrega la columna si la tabla ya existia sin ella (no falla si ya existe).
ALTER TABLE centro_costo ADD COLUMN orden_control TEXT;
