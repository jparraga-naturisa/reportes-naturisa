-- Colapsa pronosticado/real de Open-Meteo en una sola columna por metrica
-- (nombrada por fuente: _meteo), igual que ya se hizo con _inamhi. El valor
-- real (si existe) tiene prioridad sobre el pronosticado, porque se escribe
-- despues en el flujo de refresco.

ALTER TABLE clima ADD COLUMN temp_min_meteo REAL;
ALTER TABLE clima ADD COLUMN temp_max_meteo REAL;
ALTER TABLE clima ADD COLUMN temp_c_meteo REAL;
ALTER TABLE clima ADD COLUMN precipitacion_meteo REAL;
ALTER TABLE clima ADD COLUMN prob_lluvia_meteo REAL;
ALTER TABLE clima ADD COLUMN viento_meteo REAL;
ALTER TABLE clima ADD COLUMN humedad_meteo REAL;
ALTER TABLE clima ADD COLUMN presion_meteo REAL;
ALTER TABLE clima ADD COLUMN uv_meteo REAL;

UPDATE clima SET
  temp_min_meteo = COALESCE(temp_min_real, temp_min_pronosticado),
  temp_max_meteo = COALESCE(temp_max_real, temp_max_pronosticado),
  temp_c_meteo = COALESCE(temp_c_real, temp_c_pronosticado),
  precipitacion_meteo = COALESCE(precipitacion_real, precipitacion_pronosticado),
  prob_lluvia_meteo = prob_lluvia_pronosticado,
  viento_meteo = COALESCE(viento_real, viento_pronosticado),
  humedad_meteo = COALESCE(humedad_real, humedad_pronosticado),
  presion_meteo = COALESCE(presion_real, presion_pronosticado),
  uv_meteo = uv_pronosticado;

ALTER TABLE clima DROP COLUMN temp_min_pronosticado;
ALTER TABLE clima DROP COLUMN temp_min_real;
ALTER TABLE clima DROP COLUMN temp_max_pronosticado;
ALTER TABLE clima DROP COLUMN temp_max_real;
ALTER TABLE clima DROP COLUMN temp_c_pronosticado;
ALTER TABLE clima DROP COLUMN temp_c_real;
ALTER TABLE clima DROP COLUMN precipitacion_pronosticado;
ALTER TABLE clima DROP COLUMN precipitacion_real;
ALTER TABLE clima DROP COLUMN prob_lluvia_pronosticado;
ALTER TABLE clima DROP COLUMN viento_pronosticado;
ALTER TABLE clima DROP COLUMN viento_real;
ALTER TABLE clima DROP COLUMN uv_pronosticado;
ALTER TABLE clima DROP COLUMN humedad_pronosticado;
ALTER TABLE clima DROP COLUMN humedad_real;
ALTER TABLE clima DROP COLUMN presion_pronosticado;
ALTER TABLE clima DROP COLUMN presion_real;
