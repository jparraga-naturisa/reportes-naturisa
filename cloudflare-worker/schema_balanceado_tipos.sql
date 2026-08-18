-- Catalogo de tipos de balanceado (productos de consumo_balanceado) con su etapa:
-- INICIADOR o ENGORDE. Clasificado por tamano de particula (mm) del nombre del
-- producto: <=1.2mm iniciador, >=1.6mm engorde (ajustar con UPDATE si algo esta mal).
CREATE TABLE IF NOT EXISTS balanceado_tipos (
  id_producto     INTEGER NOT NULL PRIMARY KEY,
  nombre_producto TEXT NOT NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN ('INICIADOR','ENGORDE'))
);

INSERT INTO balanceado_tipos (id_producto, nombre_producto, tipo) VALUES
  (27258,  'Carg Aqax Maxima Ap Na Pel 35% 2.0Mm',           'ENGORDE'),
  (259454, 'Carg Aqax Rapid Ap Pel 35% 2.0Mm',               'ENGORDE'),
  (3342,   'Cargill Aquaxcel Rapid Fd Ext 35% 2.0Mm',        'ENGORDE'),
  (3344,   'Carg Aqax Rapid Sld Ext 40% 0.8Mm',              'INICIADOR'),
  (3345,   'Carg Aqax Rapid Sld Ext 42% 0.6Mm',              'INICIADOR'),
  (260017, 'Carg Aquax Rapid Sld Ext 35% 1.2Mm',             'INICIADOR'),
  (260018, 'Carg Aquax Rapid Sld Ext 35% 1.6Mm',             'ENGORDE'),
  (3352,   'Carg Naturisa Maxima Ext 35% 1.2Mm',             'INICIADOR'),
  (3353,   'Cargill Naturisa Maxima Ext 35% 1.8Mm',          'ENGORDE'),
  (15648,  'Carg Naturisa Maxima Li 35% Ext 1.8Mm',          'ENGORDE'),
  (8120,   'Haid Shrimp Happi Lw St #5 Pel 35% 2.0Mm',       'ENGORDE'),
  (118378, 'Haid Speed Pro Bf #4 Pel 37% 1.6Mm',             'ENGORDE')
ON CONFLICT(id_producto) DO UPDATE SET
  nombre_producto = excluded.nombre_producto, tipo = excluded.tipo;
