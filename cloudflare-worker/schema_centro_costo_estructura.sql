-- Estructura de centros de costo de SAP CO (transaccion KS13, hoja TD_KS13). Se carga desde
-- el dashboard de combustible (Subir estructura CeCo). "campamentos" son los codigos de
-- sucursal entre los que se reparte el costo (segun Ha), deducidos de la finca o del nodo
-- compartido del arbol. Fuente principal para mapear centro de costo -> campamento(s).
CREATE TABLE IF NOT EXISTS centro_costo_estructura (
  codigo          TEXT NOT NULL PRIMARY KEY,
  nombre          TEXT,
  sociedad        TEXT,
  area            TEXT,
  zona            TEXT,
  cluster         TEXT,
  grupo           TEXT,
  finca           TEXT,
  operacion       TEXT,
  grupo_ceco      TEXT,
  campamentos     TEXT,      -- ej. "NA" o "NA-PE" o "BR-CA-CR-ES-MG-MH"
  bloqueado       INTEGER,   -- 1 = bloqueado para costos reales
  registrado      TEXT,
  actualizado_en  TEXT
);
