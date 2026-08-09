-- Clima por sucursal, combinando dos fuentes (columnas nombradas por fuente):
-- _meteo (Open-Meteo: forecast + archive/ERA5, ya combinados en un solo valor)
-- _inamhi (INAMHI, fuente oficial de Ecuador, solo publica el pronostico del dia actual)
-- La coordenada de cada sucursal se calcula como el promedio de sus piscinas
-- (tabla coordenadas_piscina). hora='' es el resumen diario (temp_min/max);
-- hora IN ('00:00','06:00','12:00','18:00') son lecturas puntuales (temp_c),
-- que tambien corresponden a las franjas Madrugada/Manana/Tarde/Noche de INAMHI.
CREATE TABLE IF NOT EXISTS clima (
  id_sucursal          INTEGER NOT NULL,
  fecha                TEXT NOT NULL,
  hora                 TEXT NOT NULL DEFAULT '',

  temp_min_meteo       REAL,
  temp_min_inamhi      REAL,
  temp_max_meteo       REAL,
  temp_max_inamhi      REAL,
  temp_c_meteo         REAL,
  precipitacion_meteo  REAL,
  prob_lluvia_meteo    REAL,
  lluvia_inamhi        INTEGER,
  viento_meteo         REAL,
  humedad_meteo        REAL,
  presion_meteo        REAL,
  uv_meteo             REAL,
  uv_inamhi            REAL,
  condicion_inamhi     TEXT,
  icono_inamhi         TEXT,

  actualizado_en       TEXT,
  PRIMARY KEY (id_sucursal, fecha, hora)
);
