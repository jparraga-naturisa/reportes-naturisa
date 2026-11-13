import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { compartirWhatsappTexto } from './compartirWhatsapp';
import { RESERVAS_PEROXIDO_URL } from './config';
import { COLORES } from './theme';

function fechaCorta(fechaISO) {
  if (!fechaISO) return '';
  const [, mes, dia] = fechaISO.split('-');
  return `${dia}/${mes}`;
}

function agruparPorReserva(alertas) {
  const porCodigo = new Map();
  for (const a of alertas) {
    if (!porCodigo.has(a.codigo)) {
      porCodigo.set(a.codigo, {
        codigo: a.codigo, codigoSap: a.codigoSap, sucursal: a.sucursal, solicitante: a.solicitante,
        fecha: a.fecha, estado: a.estado, materiales: [],
      });
    }
    porCodigo.get(a.codigo).materiales.push(a);
  }
  return [...porCodigo.values()].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}

export default function ReservasPeroxidoListado({ token, onSesionExpirada }) {
  const [alertas, setAlertas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback((mostrarSpinnerGrande) => {
    if (mostrarSpinnerGrande) setCargando(true);
    setError('');
    return fetch(RESERVAS_PEROXIDO_URL, {
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
      .catch((e) => setError(e.message || 'No se pudo cargar las reservas'))
      .finally(() => { setCargando(false); setRefrescando(false); });
  }, [token, onSesionExpirada]);

  useEffect(() => { cargar(true); }, [cargar]);

  function onRefrescar() {
    setRefrescando(true);
    cargar(false);
  }

  async function compartirReserva(r) {
    const detalle = r.materiales.map((m) => `- ${m.item} (${m.piscina}): ${m.cantidad} ${m.unidad} en ${m.almacen}`).join('\n');
    const mensaje = `Reserva ${r.codigo} (${r.estado}) - ${r.sucursal}:\n${detalle}\nPendiente de dar consumo.`;
    try {
      await compartirWhatsappTexto(mensaje);
    } catch (e) {
      // silencioso: si falla, el usuario puede reintentar tocando de nuevo
    }
  }

  const reservas = agruparPorReserva(alertas);

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
      <Text style={styles.titulo}>Reservas de Peróxido pendientes de dar consumo</Text>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : reservas.length === 0 ? (
        <View style={styles.sinAlertas}>
          <Text style={styles.sinAlertasTexto}>Sin reservas de Peróxido pendientes.</Text>
        </View>
      ) : (
        reservas.map((r) => (
          <View key={r.codigo} style={styles.tarjeta}>
            <View style={styles.tarjetaEncabezado}>
              <View style={{ flex: 1 }}>
                <Text style={styles.codigoTexto}>{r.codigo} · {fechaCorta(r.fecha)}</Text>
                <Text style={styles.subTexto}>
                  {r.sucursal} · {r.solicitante}
                </Text>
              </View>
              <Text style={styles.estadoTexto}>{r.estado}</Text>
              <TouchableOpacity style={styles.colIcono} onPress={() => compartirReserva(r)}>
                <FontAwesome6 name="whatsapp" iconStyle="brand" size={20} color="#22E39E" />
              </TouchableOpacity>
            </View>

            {r.materiales.map((m, i) => (
              <View key={m.item + i} style={[styles.filaMaterial, i % 2 === 0 && styles.filaPar]}>
                <View style={styles.itemCol}>
                  <Text style={styles.itemTexto} numberOfLines={1}>{m.codigoSap || m.item}</Text>
                </View>
                <Text style={styles.piscinaTexto} numberOfLines={1}>{m.piscina}</Text>
                <Text style={styles.almacenTexto}>{m.almacen}</Text>
                <Text style={styles.cantidadTexto}>{m.cantidad} {m.unidad}</Text>
              </View>
            ))}
          </View>
        ))
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
  tarjeta: {
    backgroundColor: COLORES.tarjeta, borderRadius: 12, overflow: 'hidden', marginBottom: 12,
    borderWidth: 1, borderColor: COLORES.tarjetaBorde,
  },
  tarjetaEncabezado: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: COLORES.tarjetaBorde, backgroundColor: 'rgba(59,130,246,0.1)',
  },
  codigoTexto: { color: COLORES.acento, fontWeight: 'bold', fontSize: 13 },
  subTexto: { color: COLORES.acento2, fontSize: 10, marginTop: 1 },
  estadoTexto: { color: COLORES.destacado, fontWeight: 'bold', fontSize: 10 },
  colIcono: { width: 30, alignItems: 'center' },
  filaMaterial: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12 },
  filaPar: { backgroundColor: 'rgba(255,255,255,0.03)' },
  itemCol: { flex: 1.5 },
  itemTexto: { color: COLORES.texto, fontSize: 11, fontWeight: '600' },
  sapTexto: { color: COLORES.textoMuted, fontSize: 9, marginTop: 1 },
  piscinaTexto: { flex: 0.8, color: COLORES.acento, fontSize: 10, fontWeight: '600', textAlign: 'center' },
  almacenTexto: { flex: 0.6, color: COLORES.textoMuted, fontSize: 10, textAlign: 'center' },
  cantidadTexto: { flex: 0.8, color: COLORES.texto, fontSize: 11, textAlign: 'right' },
});
