export const LOGIN_URL = 'https://gateway.naturisa.com.ec/bff/web/ap1/security/api/auth';
export const REPORTE_URL = 'https://naturisa-proxy.parragajonathan965.workers.dev/db/reporte-diario';
export const SUCURSALES_URL = 'https://naturisa-proxy.parragajonathan965.workers.dev/db/sucursales';
export const COSECHA_URL = 'https://naturisa-proxy.parragajonathan965.workers.dev/db/alertas-cosecha';
export const SIEMBRA_URL = 'https://naturisa-proxy.parragajonathan965.workers.dev/db/alertas-siembra';
export const LIQUIDACION_URL = 'https://naturisa-proxy.parragajonathan965.workers.dev/db/alertas-liquidacion';
// Para probar contra el worker local (wrangler dev + adb reverse tcp:8787 tcp:8787):
// EXPO_PUBLIC_INVENTARIO_LAB_URL=http://localhost:8787/db/inventario-laboratorios npx expo start
export const INVENTARIO_LAB_URL = process.env.EXPO_PUBLIC_INVENTARIO_LAB_URL
  || 'https://naturisa-proxy.parragajonathan965.workers.dev/db/inventario-laboratorios';
export const ORDEN_BLOQUEADA_URL = process.env.EXPO_PUBLIC_ORDEN_BLOQUEADA_URL
  || 'https://naturisa-proxy.parragajonathan965.workers.dev/db/alertas-orden-bloqueada';
export const CODE_APPLICATION = '55ab9cb4-c887-4f42-98ec-b90470be6613';

export const COLUMNAS_ORDEN = ['Ingreso a Muro', 'Saldo Muro', 'Cargado Tolva', 'Sobrante Tolva', 'Saldo Tolva'];

export const CORREOS_COSECHA_PARA_POR_DEFECTO = [
  'gvinces@naturisa.com.ec',
  'rmaspons@naturisa.com.ec',
  'cmarin@naturisa.com.ec',
  'foviedo@naturisa.com.ec',
];

export const CORREOS_COSECHA_CC_POR_DEFECTO = [
  'gmachuca@naturisa.com.ec',
  'dmacias@naturisa.com.ec',
  'jvera@naturisa.com.ec',
  'jcorozo@naturisa.com.ec',
];
