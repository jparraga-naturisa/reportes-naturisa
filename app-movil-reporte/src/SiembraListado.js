import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { compartirWhatsappTexto } from './compartirWhatsapp';
import { SIEMBRA_URL } from './config';
import { COLORES } from './theme';

export default function SiembraListado({ sucursales, token, onSesionExpirada }) {
  const [alertas, setAlertas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback((mostrarSpinnerGrande) => {
    if (mostrarSpinnerGrande) setCargando(true);
    setError('');
    return fetch(SIEMBRA_URL, {
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
      .catch((e) => setError(e.message || 'No se pudo cargar la siembra'))
      .finally(() => { setCargando(false); setRefrescando(false); });
  }, [token, onSesionExpirada]);

  useEffect(() => { cargar(true); }, [cargar]);

  function onRefrescar() {
    setRefrescando(true);
    cargar(false);
  }

  function nombreSucursal(id) {
    return sucursales.find((s) => s.id === id)?.nombre || `#${id}`;
  }

  const grupos = Object.values(
    alertas.reduce((acc, a) => {
      const clave = `${a.subsidiaryId}-${a.cycleCode}`;
      if (!acc[clave]) acc[clave] = { subsidiaryId: a.subsidiaryId, cycleCode: a.cycleCode, lotes: [] };
      acc[clave].lotes.push(a);
      acc[clave].horasTranscurridas = Math.max(acc[clave].horasTranscurridas || 0, a.horasTranscurridas);
      return acc;
    }, {})
  ).sort((a, b) => b.horasTranscurridas - a.horasTranscurridas);

  async function compartirGrupo(grupo) {
    const sucursal = nombreSucursal(grupo.subsidiaryId);
    const esPlural = grupo.lotes.length > 1;
    const detalleLotes = grupo.lotes.map((l) => `- ${l.lotCode}: ${l.horasTranscurridas}h`).join('\n');
    const frase = esPlural
      ? `los siguientes lotes de larvas del ciclo ${grupo.cycleCode} llevan tiempo sin sembrarse`
      : `el siguiente lote de larvas del ciclo ${grupo.cycleCode} lleva tiempo sin sembrarse`;
    const mensaje = `Buen día ${sucursal}: ${frase}:\n${detalleLotes}\n\nAlguna novedad por que no se ha realizado la siembra. Saludos.`;
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
      <Text style={styles.titulo}>Lotes de larva disponibles sin sembrar</Text>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : grupos.length === 0 ? (
        <View style={styles.sinAlertas}>
          <Text style={styles.sinAlertasTexto}>Sin lotes disponibles pendientes de siembra.</Text>
        </View>
      ) : (
        <View style={styles.tabla}>
          <View style={[styles.fila, styles.filaHeader]}>
            <Text style={[styles.celda, styles.celdaHeaderTexto, styles.colSucursal]}>Sucursal</Text>
            <Text style={[styles.celda, styles.celdaHeaderTexto, styles.colCiclo]}>Ciclo</Text>
            <Text style={[styles.celda, styles.celdaHeaderTexto]}>Horas</Text>
            <View style={styles.colIcono} />
          </View>
          {grupos.map((g, i) => (
            <View key={g.subsidiaryId + g.cycleCode} style={[styles.fila, i % 2 === 0 && styles.filaPar]}>
              <Text style={[styles.celda, styles.colSucursal, styles.celdaTexto]}>{nombreSucursal(g.subsidiaryId)}</Text>
              <Text style={[styles.celda, styles.colCiclo, styles.celdaTexto]}>{g.cycleCode}</Text>
              <Text style={[styles.celda, g.horasTranscurridas > 12 && styles.celdaDestacada]}>
                {g.horasTranscurridas}
              </Text>
              <TouchableOpacity style={styles.colIcono} onPress={() => compartirGrupo(g)}>
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
  colSucursal: { flex: 1.6, textAlign: 'left' },
  colCiclo: { flex: 1.4, textAlign: 'left' },
  colIcono: { width: 36, alignItems: 'center' },
  celdaDestacada: { fontWeight: 'bold', color: COLORES.destacado },
});
