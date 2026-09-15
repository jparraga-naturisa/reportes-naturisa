import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { COLORES } from './theme';

const REPORTES = [
  { tipo: 'alimentacion', titulo: 'Alimentación en Tolva', icono: 'wheat-awn', color: '#3B82F6' },
  { tipo: 'cosecha', titulo: 'Cosecha Prefinales', icono: 'shrimp', color: '#22D3EE' },
  { tipo: 'siembra', titulo: 'Siembra de Larva', icono: 'worm', color: '#34D399' },
  { tipo: 'liquidacion', titulo: 'Liquidación de Cosechas', icono: 'file-invoice-dollar', color: '#A78BFA' },
  // Próximos reportes se agregan acá.
];

export default function MenuReportes({ onSeleccionar, onCerrarSesion }) {
  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>¿Qué reporte querés revisar?</Text>

      <View style={styles.centro}>
        <View style={styles.grilla}>
          {REPORTES.map((r) => (
            <TouchableOpacity key={r.tipo} style={styles.tile} onPress={() => onSeleccionar(r.tipo)} activeOpacity={0.8}>
              <View style={[styles.icono, { borderColor: r.color, shadowColor: r.color }]}>
                <FontAwesome6 name={r.icono} size={30} color={r.color} />
              </View>
              <Text style={styles.tileTexto}>{r.titulo}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.piePagina}>
        <TouchableOpacity style={styles.botonSecundario} onPress={onCerrarSesion}>
          <Text style={styles.botonSecundarioTexto}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  titulo: { fontSize: 16, fontWeight: 'bold', color: COLORES.texto, textAlign: 'center', paddingVertical: 20, paddingHorizontal: 16 },
  centro: { flex: 1, justifyContent: 'center' },
  grilla: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 24, gap: 20,
    justifyContent: 'center', alignItems: 'flex-start',
  },
  tile: { width: 100, alignItems: 'center' },
  icono: {
    width: 76, height: 76, borderRadius: 20, backgroundColor: COLORES.tarjeta, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
    shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
  },
  tileTexto: { fontSize: 13, fontWeight: '600', color: COLORES.texto, textAlign: 'center' },
  piePagina: { padding: 12, borderTopWidth: 1, borderTopColor: COLORES.tarjetaBorde },
  botonSecundario: {
    paddingVertical: 14, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(251,191,36,0.4)',
  },
  botonSecundarioTexto: { color: COLORES.destacado, fontWeight: '600' },
});
