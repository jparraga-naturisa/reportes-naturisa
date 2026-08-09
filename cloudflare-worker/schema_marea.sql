-- Marea (altura del nivel del mar) por sucursal, hora por hora. Fuente Open-Meteo
-- Marine API (gratis, sin key, mismo endpoint sirve historico y pronostico).
-- Pendiente: agregar columnas _inocar cuando el sitio de INOCAR (fuente oficial)
-- vuelva a responder (esta caido con error 521 al momento de crear esta tabla).
-- La coordenada de cada sucursal es la misma que usa clima (promedio de piscinas).
CREATE TABLE IF NOT EXISTS marea (
  id_sucursal      INTEGER NOT NULL,
  fecha            TEXT NOT NULL,
  hora             TEXT NOT NULL,
  altura_marea_m   REAL,
  altura_ola_m     REAL,
  tipo_pico        TEXT,
  actualizado_en   TEXT,
  PRIMARY KEY (id_sucursal, fecha, hora)
);

-- tipo_pico: 'ALTA'/'BAJA' cuando esa hora es un maximo/minimo local de
-- altura_marea_m (equivalente a "1ra marea, 2da marea..."), NULL en las demas
-- horas. Se recalcula con /db/marea-extremos/recalcular (mismo cron liviano).
-- La hora del pico es la propia columna hora de esa fila.

-- LIMITACION CONOCIDA (2026-08-09): el modelo marino de Open-Meteo no cubre
-- fincas tierra adentro (esteros/rios). Sucursales con altura_marea_m siempre
-- NULL: Naturisa(1), Maricultura(3), Kamaclusa(4), Josefina(5), Acualit1(13),
-- Fincacua(14), Acualit2(28). Se resolveria con INOCAR (dato por puerto/zona,
-- no por coordenada exacta) cuando el sitio vuelva a responder (caia con 521).

-- HUECOS CONOCIDOS EN LA FUENTE (Open-Meteo, no arreglable de nuestro lado):
-- 1) 2025-01-28 a 2025-02-08: el modelo devuelve NULL para altura_marea_m en
--    ese rango exacto (confirmado directo contra la API, no es un error nuestro).
-- 2) Pronostico futuro: el horizonte real de sea_level_height_msl es mas corto
--    (~8-9 dias) que el limite de 15 dias que acepta la API para otros
--    parametros. Fechas mas alla de eso quedan en NULL hasta que se acerquen.
