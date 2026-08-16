-- Consumo de combustible desde SAP (Excel subido en consumos-combustible.html).
-- Clave de deduplicacion: documento_material + posicion_doc (igual que consumo_insumos),
-- con respaldo compuesto cuando esos campos vienen vacios en el Excel.
-- centro_costo es la columna principal de analisis (primera columna de datos).
CREATE TABLE IF NOT EXISTS consumo_combustible (
  clave             TEXT NOT NULL PRIMARY KEY,
  centro_costo      TEXT,
  descripcion       TEXT,
  almacen           TEXT,
  fecha             TEXT,
  cantidad          REAL,
  unidad            TEXT,
  importe           REAL,
  documento_material TEXT,
  clase_movimiento  TEXT,
  posicion_doc      TEXT,
  usuario           TEXT,
  texto_cabecera    TEXT,
  orden_control     TEXT,
  actualizado_en    TEXT
);

CREATE INDEX IF NOT EXISTS idx_consumo_combustible_centro_costo ON consumo_combustible(centro_costo);
CREATE INDEX IF NOT EXISTS idx_consumo_combustible_fecha        ON consumo_combustible(fecha);
CREATE INDEX IF NOT EXISTS idx_consumo_combustible_orden        ON consumo_combustible(orden_control);
