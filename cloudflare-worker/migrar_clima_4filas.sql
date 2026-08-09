-- Elimina la fila de resumen diario (hora='') y copia sus valores diarios
-- (temp_min/max, precipitacion, prob_lluvia, viento, humedad, presion, uv,
-- y los de inamhi) a las 4 filas horarias de esa misma fecha, para que
-- queden exactamente 4 filas por fecha (00:00, 06:00, 12:00, 18:00).

UPDATE clima SET
  temp_min_meteo = (SELECT d.temp_min_meteo FROM clima d WHERE d.id_sucursal = clima.id_sucursal AND d.fecha = clima.fecha AND d.hora = ''),
  temp_max_meteo = (SELECT d.temp_max_meteo FROM clima d WHERE d.id_sucursal = clima.id_sucursal AND d.fecha = clima.fecha AND d.hora = ''),
  precipitacion_meteo = (SELECT d.precipitacion_meteo FROM clima d WHERE d.id_sucursal = clima.id_sucursal AND d.fecha = clima.fecha AND d.hora = ''),
  prob_lluvia_meteo = (SELECT d.prob_lluvia_meteo FROM clima d WHERE d.id_sucursal = clima.id_sucursal AND d.fecha = clima.fecha AND d.hora = ''),
  viento_meteo = (SELECT d.viento_meteo FROM clima d WHERE d.id_sucursal = clima.id_sucursal AND d.fecha = clima.fecha AND d.hora = ''),
  humedad_meteo = (SELECT d.humedad_meteo FROM clima d WHERE d.id_sucursal = clima.id_sucursal AND d.fecha = clima.fecha AND d.hora = ''),
  presion_meteo = (SELECT d.presion_meteo FROM clima d WHERE d.id_sucursal = clima.id_sucursal AND d.fecha = clima.fecha AND d.hora = ''),
  uv_meteo = (SELECT d.uv_meteo FROM clima d WHERE d.id_sucursal = clima.id_sucursal AND d.fecha = clima.fecha AND d.hora = ''),
  temp_min_inamhi = (SELECT d.temp_min_inamhi FROM clima d WHERE d.id_sucursal = clima.id_sucursal AND d.fecha = clima.fecha AND d.hora = ''),
  temp_max_inamhi = (SELECT d.temp_max_inamhi FROM clima d WHERE d.id_sucursal = clima.id_sucursal AND d.fecha = clima.fecha AND d.hora = ''),
  uv_inamhi = (SELECT d.uv_inamhi FROM clima d WHERE d.id_sucursal = clima.id_sucursal AND d.fecha = clima.fecha AND d.hora = ''),
  lluvia_inamhi = (SELECT d.lluvia_inamhi FROM clima d WHERE d.id_sucursal = clima.id_sucursal AND d.fecha = clima.fecha AND d.hora = '')
WHERE hora != '';

DELETE FROM clima WHERE hora = '';
