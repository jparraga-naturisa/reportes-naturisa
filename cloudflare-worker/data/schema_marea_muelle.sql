-- Marea (altura del nivel del mar) por muelle, hora por hora. Igual que la tabla
-- `marea` (por sucursal) pero usando las coordenadas propias de cada muelle
-- (tabla `muelles`), ya que los muelles de logistica de gabarras (Cargill, Brisas,
-- etc.) no son sucursales y por eso no tenian marea propia.
-- Fuente Open-Meteo Marine API (gratis, sin key, mismo endpoint sirve historico y pronostico).
CREATE TABLE IF NOT EXISTS marea_muelle (
  muelle           TEXT NOT NULL,
  fecha            TEXT NOT NULL,
  hora             TEXT NOT NULL,
  altura_marea_m   REAL,
  altura_ola_m     REAL,
  tipo_pico        TEXT,
  actualizado_en   TEXT,
  PRIMARY KEY (muelle, fecha, hora)
);

-- tipo_pico: 'ALTA'/'BAJA' cuando esa hora es un maximo/minimo local de
-- altura_marea_m, NULL en las demas horas. Se recalcula con
-- /db/marea-muelle-extremos/recalcular.
