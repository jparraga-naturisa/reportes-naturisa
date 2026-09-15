import { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome6 } from '@expo/vector-icons';
import AlertaSucursalBox from './AlertaSucursalBox';
import CosechaListado from './CosechaListado';
import SiembraListado from './SiembraListado';
import LiquidacionListado from './LiquidacionListado';
import { COLORES, GRADIENTE_BOTON } from './theme';

const TITULOS = {
  alimentacion: 'Alimentación en Tolva',
  cosecha: 'Cosecha Prefinales',
  siembra: 'Siembra de Larva',
  liquidacion: 'Liquidación de Cosechas',
};

export default function ReporteScreen({ tipo, sucursales, token, onCambiarReporte, onCerrarSesion }) {
  const [resultados, setResultados] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);

  const todasCargadas = sucursales.every((s) => s.id in resultados);
  const ningunaConAlertas = todasCargadas && Object.values(resultados).every((tiene) => !tiene);

  function actualizar() {
    setResultados({});
    setRefreshKey((k) => k + 1);
  }

  return (
    <View style={styles.container}>
      <View style={styles.encabezado}>
        <Text style={styles.encabezadoTitulo}>{TITULOS[tipo] || ''}</Text>
      </View>

      {tipo === 'cosecha' ? (
        <CosechaListado key={refreshKey} sucursales={sucursales} token={token} onSesionExpirada={onCerrarSesion} />
      ) : tipo === 'siembra' ? (
        <SiembraListado key={refreshKey} sucursales={sucursales} token={token} onSesionExpirada={onCerrarSesion} />
      ) : tipo === 'liquidacion' ? (
        <LiquidacionListado key={refreshKey} sucursales={sucursales} token={token} onSesionExpirada={onCerrarSesion} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {ningunaConAlertas && (
            <View style={styles.sinAlertas}>
              <Text style={styles.sinAlertasTexto}>Todas las piscinas con movimiento normal.</Text>
            </View>
          )}
          {sucursales.map((sucursal) => (
            <AlertaSucursalBox
              key={`${sucursal.id}-${refreshKey}`}
              sucursal={sucursal}
              token={token}
              onSesionExpirada={onCerrarSesion}
              onResultado={(tieneAlertas) => setResultados((prev) => ({ ...prev, [sucursal.id]: tieneAlertas }))}
            />
          ))}
        </ScrollView>
      )}

      <View style={styles.piePagina}>
        <TouchableOpacity style={styles.botonMitad} onPress={actualizar} activeOpacity={0.85}>
          <LinearGradient colors={GRADIENTE_BOTON} style={styles.botonRegresar}>
            <FontAwesome6 name="rotate-right" size={14} color="#fff" />
            <Text style={styles.botonRegresarTexto}>Actualizar</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={styles.botonMitad} onPress={onCambiarReporte} activeOpacity={0.85}>
          <LinearGradient colors={GRADIENTE_BOTON} style={styles.botonRegresar}>
            <Text style={styles.botonRegresarTexto}>‹ Regresar</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  encabezado: {
    alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORES.tarjetaBorde,
  },
  encabezadoTitulo: { fontSize: 15, fontWeight: 'bold', color: COLORES.texto },
  scroll: { padding: 12, paddingBottom: 24 },
  sinAlertas: {
    backgroundColor: COLORES.tarjeta, borderRadius: 12, padding: 24, marginBottom: 16, alignItems: 'center',
    borderWidth: 1, borderColor: COLORES.tarjetaBorde,
  },
  sinAlertasTexto: { color: COLORES.acento, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  piePagina: { flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: COLORES.tarjetaBorde },
  botonMitad: { flex: 1 },
  botonRegresar: {
    flexDirection: 'row', gap: 8, borderRadius: 10, paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  botonRegresarTexto: { color: '#fff', fontWeight: 'bold' },
});
