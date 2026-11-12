-- Reparto de un centro de costo entre campamentos (sucursales), configurado desde el
-- dashboard de combustible. El costo de ese centro de costo se divide entre estas
-- sucursales proporcional a sus Ha activas. Sin fila = se usa lo de la data maestra.
CREATE TABLE IF NOT EXISTS centro_costo_reparto (
  codigo          TEXT NOT NULL PRIMARY KEY,   -- codigo del centro de costo (SAP)
  sucursales      TEXT NOT NULL,               -- ids de sucursal separados por coma, ej. "19,20,21"
  usuario         TEXT,
  actualizado_en  TEXT
);
