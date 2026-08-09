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
  actualizado_en   TEXT,
  PRIMARY KEY (id_sucursal, fecha, hora)
);

-- LIMITACION CONOCIDA (2026-08-09): el modelo marino de Open-Meteo no cubre
-- fincas tierra adentro (esteros/rios). Sucursales con altura_marea_m siempre
-- NULL: Naturisa(1), Maricultura(3), Kamaclusa(4), Josefina(5), Acualit1(13),
-- Fincacua(14), Acualit2(28). Se resolveria con INOCAR (dato por puerto/zona,
-- no por coordenada exacta) cuando el sitio vuelva a responder (caia con 521).
