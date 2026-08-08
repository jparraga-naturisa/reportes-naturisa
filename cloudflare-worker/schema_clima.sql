-- Pronostico diario del clima por sucursal, fuente: Open-Meteo (gratis, sin API key).
-- La coordenada de cada sucursal se calcula como el promedio de sus piscinas
-- (tabla coordenadas_piscina) - no se guarda una coordenada de sucursal aparte.
-- Solo los datos relevantes para cultivo de camaron.
CREATE TABLE IF NOT EXISTS clima_pronostico (
  id_sucursal          INTEGER NOT NULL,
  fecha                TEXT NOT NULL,
  temp_min_c           REAL,
  temp_max_c           REAL,
  precipitacion_mm     REAL,
  prob_lluvia_pct      REAL,
  viento_max_kmh       REAL,
  uv_max               REAL,
  humedad_relativa_pct REAL,
  presion_hpa          REAL,
  actualizado_en       TEXT,
  PRIMARY KEY (id_sucursal, fecha)
);
