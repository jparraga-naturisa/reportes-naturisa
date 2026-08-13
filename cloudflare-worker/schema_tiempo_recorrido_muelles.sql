-- Tiempo estimado de recorrido entre muelles para gabarra cargada con balanceado.
-- Velocidades: 9.0 nudos a favor de marea/corriente, 5.0 nudos en contra.
-- tiempo_favor_h / tiempo_contra_h en horas decimales (h:mm se calcula al mostrar).
CREATE TABLE IF NOT EXISTS tiempo_recorrido_muelles (
  origen            TEXT NOT NULL,
  destino           TEXT NOT NULL,
  distancia_km      REAL,
  distancia_mn      REAL,
  vel_favor_nudos   REAL,
  tiempo_favor_h    REAL,
  vel_contra_nudos  REAL,
  tiempo_contra_h   REAL,
  PRIMARY KEY (origen, destino)
);

INSERT INTO tiempo_recorrido_muelles (origen, destino, distancia_km, distancia_mn, vel_favor_nudos, tiempo_favor_h, vel_contra_nudos, tiempo_contra_h) VALUES
  ('Bonanza',  'Brisas',   94.38, 50.96, 9.0, 5.66, 5.0, 10.19),
  ('Bonanza',  'Cargill',  97.07, 52.41, 9.0, 5.82, 5.0, 10.48),
  ('Bonanza',  'Golfomar', 37.64, 20.32, 9.0, 2.26, 5.0, 4.06),
  ('Bonanza',  'Inducam',  60.33, 32.57, 9.0, 3.62, 5.0, 6.51),
  ('Bonanza',  'Pesjoya',  84.41, 45.58, 9.0, 5.06, 5.0, 9.12),
  ('Bonanza',  'Rio Nilo', 35.21, 19.01, 9.0, 2.11, 5.0, 3.80),
  ('Bonanza',  'Roblemar',  2.15,  1.16, 9.0, 0.13, 5.0, 0.23),
  ('Brisas',   'Cargill',   6.32,  3.41, 9.0, 0.38, 5.0, 0.68),
  ('Brisas',   'Golfomar', 56.76, 30.65, 9.0, 3.41, 5.0, 6.13),
  ('Brisas',   'Inducam',  34.34, 18.54, 9.0, 2.06, 5.0, 3.71),
  ('Brisas',   'Pesjoya',  13.57,  7.33, 9.0, 0.81, 5.0, 1.47),
  ('Brisas',   'Rio Nilo', 87.31, 47.15, 9.0, 5.24, 5.0, 9.43),
  ('Brisas',   'Roblemar', 96.36, 52.03, 9.0, 5.78, 5.0, 10.41),
  ('Cargill',  'Golfomar', 59.47, 32.11, 9.0, 3.57, 5.0, 6.42),
  ('Cargill',  'Inducam',  36.74, 19.84, 9.0, 2.20, 5.0, 3.97),
  ('Cargill',  'Pesjoya',  13.25,  7.15, 9.0, 0.79, 5.0, 1.43),
  ('Cargill',  'Rio Nilo', 87.71, 47.36, 9.0, 5.26, 5.0, 9.47),
  ('Cargill',  'Roblemar', 99.09, 53.50, 9.0, 5.94, 5.0, 10.70),
  ('Golfomar', 'Inducam',  22.75, 12.28, 9.0, 1.36, 5.0, 2.46),
  ('Golfomar', 'Pesjoya',  46.99, 25.37, 9.0, 2.82, 5.0, 5.07),
  ('Golfomar', 'Rio Nilo', 39.90, 21.54, 9.0, 2.39, 5.0, 4.31),
  ('Golfomar', 'Roblemar', 39.64, 21.40, 9.0, 2.38, 5.0, 4.28),
  ('Inducam',  'Pesjoya',  24.30, 13.12, 9.0, 1.46, 5.0, 2.62),
  ('Inducam',  'Rio Nilo', 55.12, 29.76, 9.0, 3.31, 5.0, 5.95),
  ('Inducam',  'Roblemar', 62.35, 33.67, 9.0, 3.74, 5.0, 6.73),
  ('Pesjoya',  'Rio Nilo', 74.52, 40.24, 9.0, 4.47, 5.0, 8.05),
  ('Pesjoya',  'Roblemar', 86.47, 46.69, 9.0, 5.19, 5.0, 9.34),
  ('Rio Nilo', 'Roblemar', 36.77, 19.86, 9.0, 2.21, 5.0, 3.97)
ON CONFLICT(origen, destino) DO UPDATE SET
  distancia_km = excluded.distancia_km, distancia_mn = excluded.distancia_mn,
  vel_favor_nudos = excluded.vel_favor_nudos, tiempo_favor_h = excluded.tiempo_favor_h,
  vel_contra_nudos = excluded.vel_contra_nudos, tiempo_contra_h = excluded.tiempo_contra_h;
