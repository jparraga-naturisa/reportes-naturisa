-- Relaciona la "orden de control" de SAP (controlOrderDocument en AP1) con la
-- sucursal/piscina/ciclo correspondiente, para poder cruzar los consumos de
-- insumos de SAP (que llegan con esa orden, no con id_ciclo) contra un ciclo real.
-- Cubre ciclos desde 2025-01-01 (mismo rango que la tabla ciclos). No todos los
-- ciclos tienen orden de control en AP1 - los que no la tienen simplemente no
-- aparecen aqui (confirmado: reintentar no los completa, es un hueco real de AP1).
CREATE TABLE IF NOT EXISTS orden_control (
  orden_control   TEXT NOT NULL PRIMARY KEY,
  id_ciclo        INTEGER NOT NULL,
  id_sucursal     INTEGER,
  codigo_sucursal TEXT,
  nombre_piscina  TEXT,
  numero_ciclo    INTEGER,
  actualizado_en  TEXT
);

CREATE INDEX IF NOT EXISTS idx_orden_control_ciclo ON orden_control(id_ciclo);
