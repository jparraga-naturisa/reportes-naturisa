-- Coordenadas de cada piscina (lat/lon), tomadas de AP1 (pools.coordinates).
-- Distinta de coordenadas_sucursal: esta es mas precisa (por piscina), esa se usa
-- para pedir el pronostico del clima (1 sola vez por finca, no por piscina).
CREATE TABLE IF NOT EXISTS coordenadas_piscina (
  id_piscina      INTEGER PRIMARY KEY,
  id_sucursal     INTEGER,
  codigo_sucursal TEXT,
  nombre_piscina  TEXT,
  latitud         REAL,
  longitud        REAL,
  actualizado_en  TEXT
);

CREATE INDEX IF NOT EXISTS idx_coordenadas_piscina_sucursal ON coordenadas_piscina(id_sucursal);
