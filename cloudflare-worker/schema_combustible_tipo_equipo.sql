-- Tipo de equipo de cada centro de costo para el dashboard de combustible, asignado por
-- NOMBRE del centro de costo (clave normalizada: minusculas, sin tildes, 20 caracteres, igual
-- que los nombres cortos de SAP). Sin fila = se usa el Grupo CeCo de la estructura KS13.
CREATE TABLE IF NOT EXISTS combustible_tipo_equipo (
  nombre          TEXT NOT NULL PRIMARY KEY,
  tipo            TEXT NOT NULL,
  usuario         TEXT,
  actualizado_en  TEXT
);
