export const PROXY   = 'https://naturisa-proxy.parragajonathan965.workers.dev';
export const API_KEY = 'nat-2024-x9k2p';
export const AUTH    = PROXY + '/bff/web/ap1/security/api/auth';
export const CAPP    = '55ab9cb4-c887-4f42-98ec-b90470be6613';

export async function apiGet(path) {
  const r = await fetch(PROXY + path, { headers: { 'X-Api-Key': API_KEY } });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' → ' + path);
  return r.json();
}

export function fmt$(v) {
  if (!v) return '$0';
  if (v >= 1000) return '$' + (v / 1000).toFixed(1) + 'k';
  return '$' + v.toFixed(2);
}

export function fmt2(v) {
  return (v || 0).toFixed(2);
}
