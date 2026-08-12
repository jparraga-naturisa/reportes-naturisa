import { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AlertaSucursalBox from './AlertaSucursalBox';
import AlertaCosechaBox from './AlertaCosechaBox';

export default function ReporteScreen({ sucursales, token, onVolver, onCerrarSesion }) {
  const [pestana, setPestana] = useState('alimentacion');
  const [resultadosTolva, setResultadosTolva] = useState({});
  const [resultadosCosecha, setResultadosCosecha] = useState({});

  const todasCargadasTolva = sucursales.every((s) => s.id in resultadosTolva);
  const ningunaConAlertasTolva = todasCargadasTolva && Object.values(resultadosTolva).every((tiene) => !tiene);

  const todasCargadasCosecha = sucursales.every((s) => s.id in resultadosCosecha);
  const ningunaConAlertasCosecha = todasCargadasCosecha && Object.values(resultadosCosecha).every((tiene) => !tiene);

  return (
    <View style={styles.container}>
      <View style={styles.pestanas}>
        <TouchableOpacity
          style={[styles.pestana, pestana === 'alimentacion' && styles.pestanaActiva]}
          onPress={() => setPestana('alimentacion')}
        >
          <Text style={[styles.pestanaTexto, pestana === 'alimentacion' && styles.pestanaTextoActivo]}>Alimentación</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pestana, pestana === 'cosecha' && styles.pestanaActiva]}
          onPress={() => setPestana('cosecha')}
        >
          <Text style={[styles.pestanaTexto, pestana === 'cosecha' && styles.pestanaTextoActivo]}>Cosechas</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={pestana === 'alimentacion' ? styles.visible : styles.oculto}>
          {ningunaConAlertasTolva && (
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
              onResultado={(tieneAlertas) => setResultadosTolva((prev) => ({ ...prev, [sucursal.id]: tieneAlertas }))}
            />
          ))}
        </View>

        <View style={pestana === 'cosecha' ? styles.visible : styles.oculto}>
          {ningunaConAlertasCosecha && (
            <View style={styles.sinAlertas}>
              <Text style={styles.sinAlertasTexto}>Sin cosechas Pre-Final pendientes de Final.</Text>
            </View>
          )}
          {sucursales.map((sucursal) => (
            <AlertaCosechaBox
              key={sucursal.id}
              sucursal={sucursal}
              token={token}
              onSesionExpirada={onCerrarSesion}
              onResultado={(tieneAlertas) => setResultadosCosecha((prev) => ({ ...prev, [sucursal.id]: tieneAlertas }))}
            />
          ))}
        </View>
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
  pestanas: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  pestana: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  pestanaActiva: { borderBottomColor: '#4F6D8C' },
  pestanaTexto: { color: '#888', fontWeight: '600', fontSize: 13 },
  pestanaTextoActivo: { color: '#4F6D8C' },
  scroll: { padding: 12, paddingBottom: 24 },
  visible: { display: 'flex' },
  oculto: { display: 'none' },
  sinAlertas: { backgroundColor: '#fff', borderRadius: 10, padding: 24, marginBottom: 16, alignItems: 'center' },
  sinAlertasTexto: { color: '#4F6D8C', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  piePagina: { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  botonSecundario: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#D0D8E4' },
  botonSecundarioTexto: { color: '#555' },
  botonVolver: { flex: 1, backgroundColor: '#4F6D8C', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  botonVolverTexto: { color: '#fff', fontWeight: 'bold' },
});
