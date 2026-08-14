-- Schema para Control de Cambios en D1
-- Ejecutar en Cloudflare D1: wrangler d1 execute naturisa-db --file=schema_control_cambios.sql

CREATE TABLE IF NOT EXISTS cambios_registros (
  id              INTEGER PRIMARY KEY,
  fechaReporte    TEXT NOT NULL,
  sucursal        TEXT,
  area            TEXT,
  modulo          TEXT,
  descripcion     TEXT,
  extras          TEXT    DEFAULT '{}',
  causa           TEXT,
  prioridad       TEXT,
  solicitante     TEXT,
  estado          TEXT    DEFAULT 'Abierto',
  fechaResolucion TEXT,
  creadoEn        TEXT,
  departamentos   TEXT    DEFAULT '[]',
  deptDone        TEXT    DEFAULT '{}',
  deptDoneDates   TEXT    DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS cambios_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cambios_usuarios (
  id       INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role     TEXT DEFAULT 'user'
);

-- Insertar usuarios por defecto (solo si la tabla está vacía)
INSERT OR IGNORE INTO cambios_usuarios (id, username, password, role) VALUES
  (1, 'jparraga', 'Naturisa2025', 'admin'),
  (2, 'jcorozo',  'Naturisa2025', 'admin'),
  (3, 'jcorozo2', 'Naturisa2025', 'admin'),
  (4, 'producc',  'Naturisa2024', 'user'),
  (5, 'bodega',   'Naturisa2024', 'user'),
  (6, 'ssgg',     'Naturisa2024', 'user');
