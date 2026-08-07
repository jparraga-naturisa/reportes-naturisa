-- Tabla compartida de sucursales, usable desde cualquier dashboard/proyecto
-- via GET https://<tu-worker>.workers.dev/db/sucursales

CREATE TABLE IF NOT EXISTS sucursales (
  id   INTEGER PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL
);

INSERT OR REPLACE INTO sucursales (id, code, name) VALUES
  (13, 'A1', 'Acualit 1'),
  (28, 'A2', 'Acualit 2'),
  (6,  'BR', 'Biorey'),
  (19, 'BO', 'Bonanza'),
  (8,  'CA', 'Camaron'),
  (7,  'CR', 'Camino Real'),
  (10034, 'CO', 'Coaque'),
  (11, 'ES', 'Esteromar'),
  (14, 'FI', 'Fincacua'),
  (17, 'GO', 'Golfomar'),
  (16, 'GR', 'Granmar'),
  (15, 'IN', 'Inducam'),
  (5,  'JO', 'Josefina'),
  (4,  'KA', 'Kamaclusa'),
  (18, 'LA', 'Lanconor'),
  (21, 'LG', 'Los Gelices'),
  (9,  'MH', 'Marchena'),
  (10, 'MG', 'Margolfo'),
  (3,  'MA', 'Maricultura'),
  (1,  'NA', 'Naturisa'),
  (2,  'PE', 'Pesjoya'),
  (12, 'RN', 'Rio Nilo'),
  (20, 'RO', 'Roblemar');
