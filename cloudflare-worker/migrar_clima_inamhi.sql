-- Columnas de INAMHI (fuente oficial, gobierno de Ecuador) agregadas a la misma
-- tabla clima. Nombradas por fuente en vez de pronosticado/real, porque INAMHI
-- solo publica el pronostico oficial del dia actual (no historico ni multi-dia).
-- temp_min_inamhi/temp_max_inamhi/uv_inamhi/lluvia_inamhi van en la fila diaria (hora='').
-- condicion_inamhi/icono_inamhi van en las filas por franja (hora='00:00'/'06:00'/'12:00'/'18:00',
-- que corresponden a Madrugada/Manana/Tarde/Noche de INAMHI).
ALTER TABLE clima ADD COLUMN temp_min_inamhi REAL;
ALTER TABLE clima ADD COLUMN temp_max_inamhi REAL;
ALTER TABLE clima ADD COLUMN uv_inamhi REAL;
ALTER TABLE clima ADD COLUMN lluvia_inamhi INTEGER;
ALTER TABLE clima ADD COLUMN condicion_inamhi TEXT;
ALTER TABLE clima ADD COLUMN icono_inamhi TEXT;
