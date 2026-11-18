-- Capacitaciones de las aplicaciones (pantalla capacitaciones-naturisa).
-- Dos tablas: el cronograma (una fila por sucursal x aplicacion x etapa) y los asistentes
-- (una fila por persona x aplicacion x sesion). Las escribe la pantalla con la sesion de
-- Control de Usuarios (POST /d1/usuarios/login), asi varios usuarios comparten lo mismo.

-- ── Cronograma ──────────────────────────────────────────────────────────────
-- etapa: cap (capacitacion, 1 dia) | sop (soporte, 5 dias habiles) | seg (seguimiento, 5 dias)
-- El soporte y el seguimiento se calculan desde la capacitacion; solo esa fecha se edita.
-- fecha_ini/fecha_fin vacios = todavia sin programar.
CREATE TABLE IF NOT EXISTS capacitaciones_plan (
  id               TEXT PRIMARY KEY,     -- par-s13, par-sop-s13, par-seg-s13
  app              TEXT,                 -- par | cos | com (null si la actividad no es de una app)
  etapa            TEXT NOT NULL,        -- cap | sop | seg
  sub_id           INTEGER,              -- id de la tabla sucursales (= idSubsidiary de AP1)
  sucursal         TEXT,                 -- nombre al momento de guardar, para leer sin cruzar
  nombre           TEXT,
  responsable      TEXT,
  dirigido_a       TEXT,
  fecha_ini        TEXT,                 -- YYYY-MM-DD o ''
  fecha_fin        TEXT,
  avance           INTEGER NOT NULL DEFAULT 0,   -- 0 a 100; 100 = completa
  notas            TEXT,
  actualizado_por  TEXT,
  actualizado_en   TEXT
);
CREATE INDEX IF NOT EXISTS idx_cap_plan_suc   ON capacitaciones_plan(sub_id);
CREATE INDEX IF NOT EXISTS idx_cap_plan_fecha ON capacitaciones_plan(fecha_ini);

-- ── Asistentes ──────────────────────────────────────────────────────────────
-- Una fila por persona y aplicacion: quien asistio, a que capacitacion y donde.
-- Los datos de la persona salen de RRHH por cedula (origen = rrhh); si no esta en RRHH
-- se escriben a mano (origen = manual).
CREATE TABLE IF NOT EXISTS capacitaciones_asistentes (
  id              TEXT PRIMARY KEY,
  cedula          TEXT NOT NULL,
  nombre          TEXT NOT NULL,
  cargo           TEXT,
  area            TEXT,                  -- centro de costo / area de RRHH
  estado_rrhh     TEXT,                  -- ACTIVO, INACTIVO, NO ENCONTRADO
  origen          TEXT NOT NULL,         -- rrhh | manual
  app             TEXT NOT NULL,         -- par | cos | com
  lugar_id        TEXT,                  -- id de sucursal, o __matriz / __virtual
  lugar           TEXT,                  -- nombre legible del lugar
  fecha           TEXT NOT NULL,         -- dia de la capacitacion
  instructor      TEXT,
  registrado_por  TEXT,
  registrado_en   TEXT
);
CREATE INDEX IF NOT EXISTS idx_cap_asis_fecha  ON capacitaciones_asistentes(fecha);
CREATE INDEX IF NOT EXISTS idx_cap_asis_cedula ON capacitaciones_asistentes(cedula);
CREATE INDEX IF NOT EXISTS idx_cap_asis_lugar  ON capacitaciones_asistentes(lugar_id, fecha);
