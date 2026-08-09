-- Consumo diario de alimento balanceado por piscina y producto, fuente AP1
-- feedcontrol/balanceado/api/report/consumptions - da cycleCode directo (mas
-- confiable que cruzar fechas), ademas del producto especifico usado ese dia.
CREATE TABLE IF NOT EXISTS consumo_balanceado (
  id_piscina       INTEGER NOT NULL,
  fecha            TEXT NOT NULL,
  id_producto      INTEGER NOT NULL,
  nombre_producto  TEXT,
  id_ciclo         INTEGER,
  codigo_ciclo     TEXT,
  codigo_sucursal  TEXT,
  nombre_piscina   TEXT,
  sacos            REAL,
  kilogramos       REAL,
  kg_ha_dia        REAL,
  actualizado_en   TEXT,
  PRIMARY KEY (id_piscina, fecha, id_producto)
);

CREATE INDEX IF NOT EXISTS idx_consumo_balanceado_ciclo ON consumo_balanceado(id_ciclo);
