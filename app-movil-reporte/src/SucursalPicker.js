import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SUCURSALES_URL } from './config';

export default function SucursalPicker({ onEjecutar, onCerrarSesion, onEditarCorreos }) {
  const [sucursales, setSucursales] = useState([]);
  const [seleccionadas, setSeleccionadas] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(SUCURSALES_URL)
      .then((r) => r.json())
      .then((json) => {
        const CLUSTERS_EXCLUIDOS = ['Oficina', 'Laboratorio', 'Acopio'];
        const lista = (json.data || [])
          .filter((s) => s.cluster && !CLUSTERS_EXCLUIDOS.includes(s.cluster))
          .sort((a, b) => a.nombre.localeCompare(b.nombre));
        setSucursales(lista);
      })
      .catch(() => setError('No se pudo cargar la lista de sucursales'))
      .finally(() => setCargando(false));
  }, []);

  function alternar(id) {
    setSeleccionadas((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const elegidas = sucursales.filter((s) => seleccionadas[s.id]);
  const todasMarcadas = sucursales.length > 0 && elegidas.length === sucursales.length;

  function alternarTodas() {
    if (todasMarcadas) {
      setSeleccionadas({});
    } else {
      setSeleccionadas(Object.fromEntries(sucursales.map((s) => [s.id, true])));
    }
  }

  if (cargando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color="#4F6D8C" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Elegí las sucursales</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.filaAcciones}>
        <TouchableOpacity onPress={onEditarCorreos}>
          <Text style={styles.marcarTodasTexto}>Editar correos</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={alternarTodas}>
          <Text style={styles.marcarTodasTexto}>
            {todasMarcadas ? 'Desmarcar todas' : 'Marcar todas'}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={sucursales}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.lista}
        renderItem={({ item }) => {
          const marcada = !!seleccionadas[item.id];
          return (
            <TouchableOpacity style={styles.fila} onPress={() => alternar(item.id)}>
              <View style={[styles.check, marcada && styles.checkMarcado]}>
                {marcada ? <Text style={styles.checkTexto}>✓</Text> : null}
              </View>
              <Text style={styles.filaTexto}>{item.nombre}</Text>
              <Text style={styles.filaCluster}>{item.cluster || ''}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <View style={styles.piePagina}>
        <TouchableOpacity style={styles.botonSecundario} onPress={onCerrarSesion}>
          <Text style={styles.botonSecundarioTexto}>Cerrar sesión</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.botonEjecutar, !elegidas.length && styles.botonDeshabilitado]}
          onPress={() => onEjecutar(elegidas)}
          disabled={!elegidas.length}
        >
          <Text style={styles.botonEjecutarTexto}>
            Ejecutar {elegidas.length ? `(${elegidas.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F6F8' },
  titulo: { fontSize: 15, fontWeight: 'bold', color: '#4F6D8C', textAlign: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  error: { color: '#3D5A75', textAlign: 'center', paddingBottom: 10 },
  filaAcciones: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 8 },
  marcarTodasTexto: { color: '#4F6D8C', fontWeight: 'bold', fontSize: 13 },
  lista: { paddingHorizontal: 16, paddingBottom: 12 },
  fila: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 6, borderWidth: 1, borderColor: '#E0E6ED',
  },
  check: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: '#4F6D8C',
    marginRight: 12, justifyContent: 'center', alignItems: 'center',
  },
  checkMarcado: { backgroundColor: '#4F6D8C' },
  checkTexto: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  filaTexto: { flex: 1, fontSize: 14, color: '#222' },
  filaCluster: { fontSize: 11, color: '#888' },
  piePagina: { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  botonSecundario: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#D0D8E4' },
  botonSecundarioTexto: { color: '#555' },
  botonEjecutar: { flex: 1, backgroundColor: '#4F6D8C', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  botonEjecutarTexto: { color: '#fff', fontWeight: 'bold' },
  botonDeshabilitado: { opacity: 0.5 },
});
