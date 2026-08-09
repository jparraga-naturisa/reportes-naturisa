-- Consumo de insumos desde SAP (Excel subido en consumos-insumos.html). id_ciclo
-- se resuelve via orden_control (columna "orden" del Excel = controlOrderDocument).
-- Clave de deduplicacion: documento_material + posicion_doc (igual que la app),
-- con respaldo compuesto cuando esos campos vienen vacios en el Excel.
CREATE TABLE IF NOT EXISTS consumo_insumos (
  clave             TEXT NOT NULL PRIMARY KEY,
  orden_control     TEXT,
  id_ciclo          INTEGER,
  documento_material TEXT,
  posicion_doc      TEXT,
  codigo_material   TEXT,
  descripcion       TEXT,
  cantidad          REAL,
  importe           REAL,
  almacen           TEXT,
  unidad            TEXT,
  fecha             TEXT,
  tipo_movimiento   TEXT,
  actualizado_en    TEXT
);

CREATE INDEX IF NOT EXISTS idx_consumo_insumos_ciclo ON consumo_insumos(id_ciclo);
CREATE INDEX IF NOT EXISTS idx_consumo_insumos_orden ON consumo_insumos(orden_control);
