-- Recursos operativos por sucursal (recursos-sucursal/recursos-sucursal.html).
-- Los biologos llenan cuantas estaciones de bomba, vehiculos repartidores de diesel y parametristas
-- tiene cada granja. sub_id = id de la tabla sucursales (= idSubsidiary de AP1).
-- Se editan desde la pantalla (PUT /d1/recursos-sucursal, con token AP1).
CREATE TABLE IF NOT EXISTS recursos_sucursal (
  sub_id            INTEGER NOT NULL PRIMARY KEY,
  sucursal          TEXT NOT NULL,
  estaciones_bomba  INTEGER,
  vehiculos_diesel  INTEGER,              -- vehiculos repartidores de diesel
  parametristas     INTEGER,
  observaciones     TEXT,
  actualizado_por   TEXT,
  actualizado_en    TEXT
);
