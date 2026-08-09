-- Reordena las columnas de clima para que cada metrica quede junto a su
-- contraparte de la otra fuente (meteo primero, inamhi despues).
CREATE TABLE clima_nueva (
  id_sucursal          INTEGER NOT NULL,
  fecha                TEXT NOT NULL,
  hora                 TEXT NOT NULL DEFAULT '',

  temp_min_meteo        REAL,
  temp_min_inamhi       REAL,
  temp_max_meteo        REAL,
  temp_max_inamhi       REAL,
  temp_c_meteo          REAL,
  precipitacion_meteo   REAL,
  prob_lluvia_meteo     REAL,
  lluvia_inamhi         INTEGER,
  viento_meteo          REAL,
  humedad_meteo         REAL,
  presion_meteo         REAL,
  uv_meteo              REAL,
  uv_inamhi             REAL,
  condicion_inamhi      TEXT,
  icono_inamhi          TEXT,

  actualizado_en        TEXT,
  PRIMARY KEY (id_sucursal, fecha, hora)
);

INSERT INTO clima_nueva (id_sucursal, fecha, hora, temp_min_meteo, temp_min_inamhi,
  temp_max_meteo, temp_max_inamhi, temp_c_meteo, precipitacion_meteo, prob_lluvia_meteo,
  lluvia_inamhi, viento_meteo, humedad_meteo, presion_meteo, uv_meteo, uv_inamhi,
  condicion_inamhi, icono_inamhi, actualizado_en)
SELECT id_sucursal, fecha, hora, temp_min_meteo, temp_min_inamhi,
  temp_max_meteo, temp_max_inamhi, temp_c_meteo, precipitacion_meteo, prob_lluvia_meteo,
  lluvia_inamhi, viento_meteo, humedad_meteo, presion_meteo, uv_meteo, uv_inamhi,
  condicion_inamhi, icono_inamhi, actualizado_en
FROM clima;

DROP TABLE clima;
ALTER TABLE clima_nueva RENAME TO clima;
