-- Coordenadas de los muelles (embarcaderos) usados para logistica/mareas,
-- distintos de las coordenadas de piscinas (coordenadas_piscina).
CREATE TABLE IF NOT EXISTS muelles (
  nombre    TEXT NOT NULL PRIMARY KEY,
  latitud   REAL NOT NULL,
  longitud  REAL NOT NULL
);

INSERT INTO muelles (nombre, latitud, longitud) VALUES
  ('Cargill',   -2.2113673, -79.8281139),
  ('Pesjoya',   -2.328837,  -79.848157),
  ('Inducam',   -2.508766,  -79.972230),
  ('Golfomar',  -2.687724,  -80.071509),
  ('Roblemar',  -3.011219,  -80.221433),
  ('Bonanza',   -2.997669,  -80.207662),
  ('Rio Nilo',  -2.997669,  -79.890544)
ON CONFLICT(nombre) DO UPDATE SET
  latitud = excluded.latitud, longitud = excluded.longitud;
