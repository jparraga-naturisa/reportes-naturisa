-- Clima por sucursal: cada metrica tiene su version pronosticada (Open-Meteo forecast,
-- se actualiza seguido, cambia hasta que llega la fecha) y su version real/observada
-- (Open-Meteo archive/ERA5, se llena unos dias despues de que pasa la fecha).
-- prob_lluvia y uv solo existen como pronostico (no tienen equivalente "real" en la fuente).
-- La coordenada de cada sucursal se calcula como el promedio de sus piscinas (coordenadas_piscina).
CREATE TABLE IF NOT EXISTS clima (
  id_sucursal              INTEGER NOT NULL,
  fecha                    TEXT NOT NULL,

  temp_min_pronosticado    REAL,
  temp_min_real            REAL,
  temp_max_pronosticado    REAL,
  temp_max_real            REAL,
  precipitacion_pronosticado REAL,
  precipitacion_real       REAL,
  prob_lluvia_pronosticado REAL,
  viento_pronosticado      REAL,
  viento_real              REAL,
  uv_pronosticado          REAL,
  humedad_pronosticado     REAL,
  humedad_real             REAL,
  presion_pronosticado     REAL,
  presion_real             REAL,

  actualizado_en           TEXT,
  PRIMARY KEY (id_sucursal, fecha)
);
