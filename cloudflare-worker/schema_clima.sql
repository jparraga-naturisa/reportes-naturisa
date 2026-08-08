-- Coordenadas de cada sucursal (lat/lon), tomadas de AP1 (subsidiaries.coordinates).
-- Se usan para pedir el pronostico del clima de cada finca a Open-Meteo.
CREATE TABLE IF NOT EXISTS coordenadas_sucursal (
  id_sucursal    INTEGER PRIMARY KEY,
  codigo_sucursal TEXT,
  latitud        REAL NOT NULL,
  longitud       REAL NOT NULL,
  actualizado_en TEXT
);

-- Pronostico diario del clima por sucursal, fuente: Open-Meteo (gratis, sin API key).
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
