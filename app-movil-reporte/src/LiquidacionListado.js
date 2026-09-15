import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { compartirWhatsappTexto } from './compartirWhatsapp';
import { LIQUIDACION_URL } from './config';
import { COLORES } from './theme';

export default function LiquidacionListado({ sucursales, token, onSesionExpirada }) {
  const [alertas, setAlertas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError('');
    fetch(LIQUIDACION_URL, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
      .then((res) => {
        if (res.status === 401) {
          onSesionExpirada();
          return null;
        }
        if (!res.ok) throw new Error(`Error del servidor (${res.status})`);
        return res.json();
      })
      .then((json) => { if (activo && json) setAlertas(json.alertas || []); })
      .catch((e) => { if (activo) setError(e.message || 'No se pudo cargar la liquidación'); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [token]);

  function nombreSucursal(codigo) {
    return sucursales.find((s) => s.codigo === codigo)?.nombre || codigo;
  }

  async function compartirFila(alerta) {
    const sucursal = nombreSucursal(alerta.subsidiaryCode);
    const mensaje = `Buen día, ${sucursal}: el lote de cosecha ${alerta.lotCode} tiene ${alerta.horasTranscurridas} horas de haber liquidado la cosecha y aún no se ha cerrado el lote. ¿Alguna novedad? Saludos.`;
    try {
      await compartirWhatsappTexto(mensaje);
    } catch (e) {
      // silencioso: si falla, el usuario puede reintentar tocando de nuevo
    }
  }

  if (cargando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={COLORES.acento} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.titulo}>Lotes liquidados con cosecha aún activa</Text>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : alertas.length === 0 ? (
        <View style={styles.sinAlertas}>
          <Text style={styles.sinAlertasTexto}>Sin liquidaciones pendientes de revisar.</Text>
        </View>
      ) : (
        <View style={styles.tabla}>
          <View style={[styles.fila, styles.filaHeader]}>
            <Text style={[styles.celda, styles.celdaHeaderTexto, styles.colLote]}>Lote</Text>
            <Text style={[styles.celda, styles.celdaHeaderTexto]}>Horas</Text>
            <View style={styles.colIcono} />
          </View>
          {alertas.map((a, i) => (
            <View key={a.lotCode + i} style={[styles.fila, i % 2 === 0 && styles.filaPar]}>
              <Text style={[styles.celda, styles.colLote, styles.celdaTexto]}>{a.lotCode}</Text>
              <Text style={styles.celda}>{a.horasTranscurridas}</Text>
              <TouchableOpacity style={styles.colIcono} onPress={() => compartirFila(a)}>
                <FontAwesome6 name="whatsapp" iconStyle="brand" size={20} color="#25D366" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 12, paddingBottom: 24 },
  titulo: { fontSize: 15, fontWeight: 'bold', color: COLORES.texto, textAlign: 'center', marginBottom: 12 },
  error: { color: COLORES.destacado, padding: 16, textAlign: 'center' },
  sinAlertas: {
    backgroundColor: COLORES.tarjeta, borderRadius: 12, padding: 24, alignItems: 'center',
    borderWidth: 1, borderColor: COLORES.tarjetaBorde,
  },
  sinAlertasTexto: { color: COLORES.acento, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  tabla: {
    backgroundColor: COLORES.tarjeta, borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORES.tarjetaBorde,
  },
  fila: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6 },
  filaHeader: { backgroundColor: 'rgba(59,130,246,0.18)' },
  filaPar: { backgroundColor: 'rgba(255,255,255,0.03)' },
  celda: { flex: 1, fontSize: 11, textAlign: 'center', color: COLORES.texto },
  celdaTexto: { fontWeight: '600' },
  celdaHeaderTexto: { color: COLORES.acento, fontWeight: 'bold', fontSize: 10 },
  colLote: { flex: 2, textAlign: 'left' },
  colIcono: { width: 36, alignItems: 'center' },
});
