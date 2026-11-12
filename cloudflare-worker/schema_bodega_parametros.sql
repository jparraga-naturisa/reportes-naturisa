-- Parametros manuales de las bodegas de balanceado por campamento (bodega/bodega.html, Reporte Islas).
-- Reemplazan los valores que se escribian a mano en "REPORTE ISLAS.xlsx": capacidad en pallets,
-- montacargas y sector (Islas / Continente). sub_id = idSubsidiary de AP1 (= branchOfficeId del portal SAP).
-- Se editan desde la pantalla (PUT /d1/bodega/parametros, con token AP1).
CREATE TABLE IF NOT EXISTS bodega_parametros (
  sub_id                 INTEGER NOT NULL PRIMARY KEY,
  campamento             TEXT NOT NULL,
  sector                 TEXT,                 -- 'Islas' | 'Isla Josefina' | 'Continente'
  capacidad_pallets      REAL,                 -- capacidad de la bodega de balanceado en pallets
  montacargas            INTEGER,              -- cantidad de montacargas
  montacargas_operativos INTEGER,
  notas                  TEXT,
  actualizado_por        TEXT,
  actualizado_en         TEXT
);

-- Valores de "REPORTE ISLAS COMPLETO V" (semana 43-2026)
INSERT INTO bodega_parametros (sub_id, campamento, sector, capacidad_pallets, montacargas, montacargas_operativos, actualizado_por, actualizado_en) VALUES
  (19,    'Bonanza',     'Islas',      132, 1, 1, 'carga inicial', '2026-10-23'),
  (21,    'Los Gelices', 'Islas',       72, 1, 1, 'carga inicial', '2026-10-23'),
  (17,    'Golfomar',    'Islas',      235, 3, 3, 'carga inicial', '2026-10-23'),
  (15,    'Inducam',     'Islas',      256, 2, 2, 'carga inicial', '2026-10-23'),
  (20,    'Roblemar',    'Islas',      220, 1, 1, 'carga inicial', '2026-10-23'),
  (13,    'Acualit 1',   'Continente',  60, 1, 1, 'carga inicial', '2026-10-23'),
  (14,    'Fincacua',    'Continente', 128, 1, 1, 'carga inicial', '2026-10-23'),
  (16,    'Granmar',     'Continente',  90, 1, 1, 'carga inicial', '2026-10-23'),
  (18,    'Lanconor',    'Continente', 300, 2, 2, 'carga inicial', '2026-10-23'),
  (10034, 'Coaque',      'Continente', 128, 1, 1, 'carga inicial', '2026-10-23'),
  (10035, 'Juananu',     'Continente',  24, 1, 1, 'carga inicial', '2026-10-23')
ON CONFLICT(sub_id) DO NOTHING;
