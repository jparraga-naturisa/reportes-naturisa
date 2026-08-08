-- Agrega columna hora a clima. Las filas diarias existentes (resumen del dia,
-- con temp_min/temp_max) pasan a tener hora='' . Las filas horarias nuevas
-- (hora IN ('00:00','06:00','12:00','18:00')) usan las columnas temp_c_* en vez
-- de temp_min_*/temp_max_* (una lectura puntual no tiene min/max).
-- SQLite no permite cambiar la PRIMARY KEY con ALTER, asi que se recrea la tabla.

CREATE TABLE clima_nueva (
  id_sucursal              INTEGER NOT NULL,
  fecha                    TEXT NOT NULL,
  hora                     TEXT NOT NULL DEFAULT '',

  temp_min_pronosticado    REAL,
  temp_min_real            REAL,
  temp_max_pronosticado    REAL,
  temp_max_real            REAL,
  temp_c_pronosticado      REAL,
  temp_c_real              REAL,
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
  PRIMARY KEY (id_sucursal, fecha, hora)
);

INSERT INTO clima_nueva (id_sucursal, fecha, hora, temp_min_pronosticado, temp_min_real,
  temp_max_pronosticado, temp_max_real, precipitacion_pronosticado, precipitacion_real,
  prob_lluvia_pronosticado, viento_pronosticado, viento_real, uv_pronosticado,
  humedad_pronosticado, humedad_real, presion_pronosticado, presion_real, actualizado_en)
SELECT id_sucursal, fecha, '', temp_min_pronosticado, temp_min_real,
  temp_max_pronosticado, temp_max_real, precipitacion_pronosticado, precipitacion_real,
  prob_lluvia_pronosticado, viento_pronosticado, viento_real, uv_pronosticado,
  humedad_pronosticado, humedad_real, presion_pronosticado, presion_real, actualizado_en
FROM clima;

DROP TABLE clima;
ALTER TABLE clima_nueva RENAME TO clima;
