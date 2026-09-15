import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { compartirWhatsappTexto } from './compartirWhatsapp';
import { COSECHA_URL } from './config';
import { COLORES } from './theme';

function fechaCorta(fechaISO) {
  if (!fechaISO) return '';
  const [, mes, dia] = fechaISO.split('-');
  return `${dia}/${mes}`;
}

export default function CosechaListado({ sucursales, token, onSesionExpirada }) {
  const [alertas, setAlertas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback((mostrarSpinnerGrande) => {
    if (mostrarSpinnerGrande) setCargando(true);
    setError('');
    const params = new URLSearchParams();
    sucursales.forEach((s) => params.append('subsidiaryId', s.id));
    return fetch(`${COSECHA_URL}?${params}`, {
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
      .catch((e) => setError(e.message || 'No se pudo cargar las cosechas'))
      .finally(() => { setCargando(false); setRefrescando(false); });
  }, [sucursales, token, onSesionExpirada]);

  useEffect(() => { cargar(true); }, [cargar]);

  function onRefrescar() {
    setRefrescando(true);
    cargar(false);
  }

  async function compartirFila(alerta) {
    const mensaje = `${alerta.subsidiary}: el ciclo ${alerta.cycleCode}, ¿cuándo se realizará la cosecha final?`;
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
      <Text style={styles.titulo}>Piscinas con cosecha prefinal sin cosecha final</Text>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : alertas.length === 0 ? (
        <View style={styles.sinAlertas}>
          <Text style={styles.sinAlertasTexto}>Sin cosechas Pre-Final pendientes de Final.</Text>
        </View>
      ) : (
        <View style={styles.tabla}>
          <View style={[styles.fila, styles.filaHeader]}>
            <Text style={[styles.celda, styles.celdaHeaderTexto, styles.colSucursal]}>Sucursal</Text>
            <Text style={[styles.celda, styles.celdaHeaderTexto, styles.colCiclo]}>Ciclo</Text>
            <Text style={[styles.celda, styles.celdaHeaderTexto]}>Pre-Final</Text>
            <Text style={[styles.celda, styles.celdaHeaderTexto]}>Días</Text>
            <View style={styles.colIcono} />
          </View>
          {alertas.map((a, i) => (
            <View key={a.cycleCode + i} style={[styles.fila, i % 2 === 0 && styles.filaPar]}>
              <Text style={[styles.celda, styles.colSucursal, styles.celdaTexto]}>{a.subsidiary}</Text>
              <Text style={[styles.celda, styles.colCiclo, styles.celdaTexto]}>{a.cycleCode}</Text>
              <Text style={styles.celda}>{fechaCorta(a.fechaPreFinal)}</Text>
              <Text style={[styles.celda, a.diasTranscurridos > 7 && styles.celdaDestacada]}>
                {a.diasTranscurridos}
              </Text>
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
  celda: { flex: 1, fontSize: 11, textAlign: 'center', color: COLORES.texto },
  celdaTexto: { fontWeight: '600' },
  celdaHeaderTexto: { color: COLORES.acento, fontWeight: 'bold', fontSize: 10 },
  colSucursal: { flex: 1.4, textAlign: 'left' },
  colCiclo: { flex: 1.4, textAlign: 'left' },
  colIcono: { width: 36, alignItems: 'center' },
  celdaDestacada: { fontWeight: 'bold', color: COLORES.destacado },
});
