-- Schema para Activos Fijos en D1
-- Ejecutar en Cloudflare D1: wrangler d1 execute naturisa-db --file=schema_activos_fijos.sql

-- Maestro de activos: se llena importando el Excel de SAP ("Data AF Naturisa") y se
-- enriquece con las columnas operativas (estado, ubicacion_actual, custodio_actual,
-- horometro_actual) que SAP no registra y que va llevando esta app.
CREATE TABLE IF NOT EXISTS activos_fijos (
  activo               INTEGER PRIMARY KEY,   -- "Activo fijo" en SAP
  clase                TEXT,                  -- "Clase" (texto, ej. EQUIPOS DE ALIMENTACION)
  clase_codigo         TEXT,                  -- "Clase activos fijos" (código numérico SAP, ej. 700, 2000)
  descripcion          TEXT,                  -- "Descripción del Activo"
  denominacion         TEXT,                  -- "Denominación"
  finca                TEXT,                  -- "Finca" (ej. "1005 - Finca Josefina")
  emplazamiento        TEXT,
  marca                TEXT,                  -- código SAP de marca (sin tabla de traducción aún)
  serie                TEXT,
  fecha_capitalizacion TEXT,
  fecha_baja           TEXT,                  -- "Descapitalización el" (si SAP la tiene, el activo está de baja)
  estado               TEXT DEFAULT 'operativo',   -- operativo|taller|espera_repuesto|baja
  ubicacion_actual     TEXT,                  -- override operativo (piscina/sector); si es NULL se usa emplazamiento
  custodio_actual      TEXT,
  horometro_actual     REAL DEFAULT 0,
  actualizado_en       TEXT
);

CREATE INDEX IF NOT EXISTS idx_af_finca ON activos_fijos(finca);
CREATE INDEX IF NOT EXISTS idx_af_clase ON activos_fijos(clase);
CREATE INDEX IF NOT EXISTS idx_af_estado ON activos_fijos(estado);

-- Historial de transferencias entre ubicaciones/custodios
CREATE TABLE IF NOT EXISTS activos_movimientos (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  activo             INTEGER NOT NULL,
  ubicacion_origen   TEXT,
  ubicacion_destino  TEXT,
  custodio_origen    TEXT,
  custodio_destino   TEXT,
  horometro          REAL,
  observaciones      TEXT,
  usuario            TEXT,
  fecha              TEXT
);

CREATE INDEX IF NOT EXISTS idx_mov_activo ON activos_movimientos(activo);

-- Órdenes de mantenimiento preventivo/correctivo
CREATE TABLE IF NOT EXISTS activos_ordenes (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  activo              INTEGER NOT NULL,
  tipo                TEXT DEFAULT 'correctivo',  -- preventivo|correctivo
  descripcion         TEXT,
  horometro_apertura  REAL,
  horometro_cierre    REAL,
  costo               REAL DEFAULT 0,
  estado              TEXT DEFAULT 'ABIERTA',     -- ABIERTA|EN_PROCESO|CERRADA
  tecnico             TEXT,
  fecha_apertura      TEXT,
  fecha_cierre        TEXT
);

CREATE INDEX IF NOT EXISTS idx_ord_activo ON activos_ordenes(activo);
CREATE INDEX IF NOT EXISTS idx_ord_estado ON activos_ordenes(estado);
