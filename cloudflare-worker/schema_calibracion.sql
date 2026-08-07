-- Calibracion (a, b, R2) por piscina para el modelo de alimento fa = a * peso^b,
-- calculada por regresion lineal sobre ln(peso) vs ln(densidad/alimento_ha_dia),
-- usando solo semanas completas de ciclos COSECHADOS. Replica la logica de
-- proyeccion-alimento.html pero calculada 100% dentro de D1 (sin llamar a AP1).

CREATE TABLE IF NOT EXISTS calibracion_alimento (
  codigo_sucursal TEXT NOT NULL,
  nombre_piscina  TEXT NOT NULL,
  n_ciclos        INTEGER,
  n_semanas       INTEGER,
  coeficiente_a   REAL,
  coeficiente_b   REAL,
  r_cuadrado      REAL,
  tipo_calculo    TEXT,
  actualizado_en  TEXT,
  PRIMARY KEY (codigo_sucursal, nombre_piscina)
);
