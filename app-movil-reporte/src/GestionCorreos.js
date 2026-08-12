import { useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import {
  obtenerCorreosCosechaPara, guardarCorreosCosechaPara,
  obtenerCorreosCosechaCc, guardarCorreosCosechaCc,
} from './correosStorage';

const GRUPOS = [
  { clave: 'cosechaPara', titulo: 'Cosecha · Para', obtener: obtenerCorreosCosechaPara, guardar: guardarCorreosCosechaPara },
  { clave: 'cosechaCc', titulo: 'Cosecha · CC', obtener: obtenerCorreosCosechaCc, guardar: guardarCorreosCosechaCc },
];

function esCorreoValido(texto) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto.trim());
}

export default function GestionCorreos({ onVolver }) {
  const [grupoActivo, setGrupoActivo] = useState('cosechaPara');
  const [listas, setListas] = useState({});
  const [nuevo, setNuevo] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all(GRUPOS.map((g) => g.obtener())).then((resultados) => {
      const mapa = {};
      GRUPOS.forEach((g, i) => { mapa[g.clave] = resultados[i]; });
      setListas(mapa);
      setCargando(false);
    });
  }, []);

  const grupo = GRUPOS.find((g) => g.clave === grupoActivo);
  const correos = listas[grupoActivo] || [];

  async function agregar() {
    const correo = nuevo.trim().toLowerCase();
    if (!esCorreoValido(correo)) {
      setError('Ingresa un correo válido');
      return;
    }
    if (correos.includes(correo)) {
      setError('Ese correo ya está en la lista');
      return;
    }
    const lista = [...correos, correo];
    setListas((prev) => ({ ...prev, [grupoActivo]: lista }));
    setNuevo('');
    setError('');
    await grupo.guardar(lista);
  }

  async function quitar(correo) {
    const lista = correos.filter((c) => c !== correo);
    setListas((prev) => ({ ...prev, [grupoActivo]: lista }));
    await grupo.guardar(lista);
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
      <Text style={styles.titulo}>Correos para alertas</Text>

      <View style={styles.pestanas}>
        {GRUPOS.map((g) => (
          <TouchableOpacity
            key={g.clave}
            style={[styles.pestana, grupoActivo === g.clave && styles.pestanaActiva]}
            onPress={() => { setGrupoActivo(g.clave); setError(''); }}
          >
            <Text style={[styles.pestanaTexto, grupoActivo === g.clave && styles.pestanaTextoActivo]}>{g.titulo}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.filaAgregar}>
        <TextInput
          style={styles.input}
          placeholder="nuevo@naturisa.com.ec"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={nuevo}
          onChangeText={setNuevo}
        />
        <TouchableOpacity style={styles.botonAgregar} onPress={agregar}>
          <Text style={styles.botonAgregarTexto}>Agregar</Text>
        </TouchableOpacity>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={correos}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.lista}
        ListEmptyComponent={<Text style={styles.vacio}>No hay correos agregados</Text>}
        renderItem={({ item }) => (
          <View style={styles.fila}>
            <Text style={styles.filaTexto}>{item}</Text>
            <TouchableOpacity onPress={() => quitar(item)}>
              <Text style={styles.quitar}>Quitar</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <View style={styles.piePagina}>
        <TouchableOpacity style={styles.botonVolver} onPress={onVolver}>
          <Text style={styles.botonVolverTexto}>Volver</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F6F8' },
  titulo: { fontSize: 15, fontWeight: 'bold', color: '#4F6D8C', textAlign: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  pestanas: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 10, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#D0D8E4' },
  pestana: { flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: '#fff' },
  pestanaActiva: { backgroundColor: '#4F6D8C' },
  pestanaTexto: { color: '#4F6D8C', fontWeight: '600', fontSize: 11 },
  pestanaTextoActivo: { color: '#fff' },
  filaAgregar: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 6 },
  input: {
    flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#D0D8E4', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
  },
  botonAgregar: { backgroundColor: '#4F6D8C', borderRadius: 8, justifyContent: 'center', paddingHorizontal: 14 },
  botonAgregarTexto: { color: '#fff', fontWeight: 'bold' },
  error: { color: '#3D5A75', textAlign: 'center', paddingBottom: 8 },
  lista: { paddingHorizontal: 16, paddingBottom: 12 },
  vacio: { textAlign: 'center', color: '#888', marginTop: 20 },
  fila: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff',
    borderRadius: 8, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#E0E6ED',
  },
  filaTexto: { flex: 1, fontSize: 13, color: '#222' },
  quitar: { color: '#3D5A75', fontWeight: 'bold', fontSize: 13 },
  piePagina: { padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  botonVolver: { backgroundColor: '#4F6D8C', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  botonVolverTexto: { color: '#fff', fontWeight: 'bold' },
});
