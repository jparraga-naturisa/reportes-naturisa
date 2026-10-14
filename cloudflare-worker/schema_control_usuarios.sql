-- Schema para Control de Usuarios (AP1 Balanceado) en D1
-- Ejecutar en Cloudflare D1: wrangler d1 execute naturisa-db --remote --file=schema_control_usuarios.sql
-- (el worker tambien las crea solo si no existen, ver asegurarTablasUsuarios)

-- Solicitudes de alta / baja / cambio que hace el jefe de campamento (solicitante).
-- El admin las aprueba o rechaza, ejecuta el cambio a mano en AP1 Seguridad y la marca EJECUTADA.
CREATE TABLE IF NOT EXISTS usuarios_solicitudes (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo                 TEXT NOT NULL,                    -- ALTA | BAJA | CAMBIO
  estado               TEXT NOT NULL DEFAULT 'PENDIENTE', -- PENDIENTE | APROBADA | EJECUTADA | RECHAZADA | ANULADA
  subsidiary_id        INTEGER NOT NULL,                 -- campamento desde donde se pide
  subsidiary_nombre    TEXT,
  user_id              INTEGER,                          -- idUser AP1 afectado (NULL en ALTA)
  user_nombre          TEXT,
  user_identificacion  TEXT,
  datos                TEXT,                             -- JSON con el detalle (datos del alta, rol/sucursal nuevos)
  motivo               TEXT,
  solicitante          TEXT NOT NULL,                    -- username AP1
  solicitante_nombre   TEXT,
  creado_en            TEXT NOT NULL,
  resuelto_por         TEXT,
  resuelto_en          TEXT,
  comentario_admin     TEXT,
  aprobado_por         TEXT,                             -- quien aprobo (resuelto_por se pisa al marcar EJECUTADA)
  aprobado_nombre      TEXT,
  aprobado_en          TEXT,
  creado_usuario       TEXT,                             -- usuario AP1 creado (alta ejecutada); la fecha es resuelto_en
  datamaestra_por      TEXT,                             -- transportista: quien confirmo que lo creo en Data Maestra
  datamaestra_nombre   TEXT,
  datamaestra_en       TEXT,
  correo_dm_estado     TEXT                              -- resultado del aviso por correo a Data Maestra
);

CREATE INDEX IF NOT EXISTS idx_us_estado ON usuarios_solicitudes(estado);
CREATE INDEX IF NOT EXISTS idx_us_sub ON usuarios_solicitudes(subsidiary_id);
CREATE INDEX IF NOT EXISTS idx_us_solicitante ON usuarios_solicitudes(solicitante);

-- Administradores de la pantalla (username AP1). Todo el que no este aqui entra como solicitante.
CREATE TABLE IF NOT EXISTS usuarios_admins (
  username      TEXT PRIMARY KEY,
  agregado_por  TEXT,
  creado_en     TEXT
);

-- Primer admin solo si la tabla esta vacia
INSERT INTO usuarios_admins (username, agregado_por, creado_en)
  SELECT 'jparraga', 'sistema', datetime('now') WHERE NOT EXISTS (SELECT 1 FROM usuarios_admins);

-- Configuracion de la pantalla (clave/valor). Ej.: correos_datamaestra = ["persona@naturisa.com.ec"]
CREATE TABLE IF NOT EXISTS usuarios_config (
  clave            TEXT PRIMARY KEY,
  valor            TEXT,
  actualizado_por  TEXT,
  actualizado_en   TEXT
);
