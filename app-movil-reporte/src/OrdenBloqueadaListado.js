import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { compartirWhatsappTexto } from './compartirWhatsapp';
import { ORDEN_BLOQUEADA_URL } from './config';
import { COLORES } from './theme';

export default function OrdenBloqueadaListado({ token, onSesionExpirada }) {
  const [alertas, setAlertas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback((mostrarSpinnerGrande) => {
    if (mostrarSpinnerGrande) setCargando(true);
    setError('');
    return fetch(ORDEN_BLOQUEADA_URL, {
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
      .then((json) => { if (json) setAlertas(json.alertas || []); })
      .catch((e) => setError(e.message || 'No se pudo cargar las órdenes de control'))
      .finally(() => { setCargando(false); setRefrescando(false); });
  }, [token, onSesionExpirada]);

  useEffect(() => { cargar(true); }, [cargar]);

  function onRefrescar() {
    setRefrescando(true);
    cargar(false);
  }

  async function compartirFila(a) {
    const mensaje = `${a.subsidiary} - ${a.poolName} (ciclo ${a.cycleCode}): la orden de control ${a.ordenControl} está bloqueada en SAP, favor desbloquear.`;
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
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefrescar} tintColor={COLORES.acento} />}
    >
      <Text style={styles.titulo}>Órdenes de control bloqueadas (último ciclo por piscina)</Text>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : alertas.length === 0 ? (
        <View style={styles.sinAlertas}>
          <Text style={styles.sinAlertasTexto}>Sin órdenes de control bloqueadas.</Text>
        </View>
      ) : (
        <View style={styles.tabla}>
          <View style={[styles.fila, styles.filaHeader]}>
            <Text style={[styles.celda, styles.celdaHeaderTexto, styles.colCiclo]}>Ciclo</Text>
            <Text style={[styles.celda, styles.celdaHeaderTexto, styles.colEstado]}>Estado</Text>
            <Text style={[styles.celda, styles.celdaHeaderTexto, styles.colOrden]}>Orden</Text>
            <View style={styles.colIcono} />
          </View>
          {alertas.map((a, i) => (
            <View key={a.ordenControl + i} style={[styles.fila, i % 2 === 0 && styles.filaPar]}>
              <Text style={[styles.celda, styles.colCiclo, styles.celdaTexto]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{a.cycleCode}</Text>
              <Text style={[styles.celda, styles.colEstado]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{a.estadoCiclo}</Text>
              <Text style={[styles.celda, styles.colOrden, styles.celdaDestacada]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{a.ordenControl}</Text>
              <TouchableOpacity style={styles.colIcono} onPress={() => compartirFila(a)}>
                <FontAwesome6 name="whatsapp" iconStyle="brand" size={20} color="#22E39E" />
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
  celda: { flex: 1, fontSize: 10, textAlign: 'center', color: COLORES.texto },
  celdaTexto: { fontWeight: '600' },
  celdaHeaderTexto: { color: COLORES.acento, fontWeight: 'bold', fontSize: 9 },
  colCiclo: { flex: 1.5, textAlign: 'left' },
  colEstado: { flex: 1.1 },
  colOrden: { flex: 1.4 },
  colIcono: { width: 30, alignItems: 'center' },
  celdaDestacada: { fontWeight: 'bold', color: COLORES.destacado },
});
