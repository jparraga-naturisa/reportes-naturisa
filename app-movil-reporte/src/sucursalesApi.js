import { SUCURSALES_URL } from './config';

const CLUSTERS_EXCLUIDOS = ['Oficina', 'Laboratorio', 'Acopio'];

export async function obtenerSucursales() {
  const res = await fetch(SUCURSALES_URL);
  const json = await res.json();
  return (json.data || [])
    .filter((s) => s.cluster && !CLUSTERS_EXCLUIDOS.includes(s.cluster))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}
