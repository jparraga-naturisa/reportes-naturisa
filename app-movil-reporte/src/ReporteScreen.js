import { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AlertaSucursalBox from './AlertaSucursalBox';

export default function ReporteScreen({ sucursales, token, onVolver, onCerrarSesion }) {
  const [resultados, setResultados] = useState({});

  function reportarResultado(idSucursal, tieneAlertas) {
    setResultados((prev) => ({ ...prev, [idSucursal]: tieneAlertas }));
  }

  const todasCargadas = sucursales.every((s) => s.id in resultados);
  const ningunaConAlertas = todasCargadas && Object.values(resultados).every((tiene) => !tiene);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {ningunaConAlertas && (
          <View style={styles.sinAlertas}>
            <Text style={styles.sinAlertasTexto}>Todas las piscinas con movimiento normal.</Text>
          </View>
        )}
        {sucursales.map((sucursal) => (
          <AlertaSucursalBox
            key={sucursal.id}
            sucursal={sucursal}
            token={token}
            onSesionExpirada={onCerrarSesion}
            onResultado={(tieneAlertas) => reportarResultado(sucursal.id, tieneAlertas)}
          />
        ))}
      </ScrollView>

      <View style={styles.piePagina}>
        <TouchableOpacity style={styles.botonSecundario} onPress={onCerrarSesion}>
          <Text style={styles.botonSecundarioTexto}>Cerrar sesión</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.botonVolver} onPress={onVolver}>
          <Text style={styles.botonVolverTexto}>Cambiar sucursales</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
  scroll: { padding: 12, paddingBottom: 24 },
  sinAlertas: { backgroundColor: '#fff', borderRadius: 10, padding: 24, marginBottom: 16, alignItems: 'center' },
  sinAlertasTexto: { color: '#4F6D8C', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  piePagina: { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  botonSecundario: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#D0D8E4' },
  botonSecundarioTexto: { color: '#555' },
  botonVolver: { flex: 1, backgroundColor: '#4F6D8C', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  botonVolverTexto: { color: '#fff', fontWeight: 'bold' },
});
