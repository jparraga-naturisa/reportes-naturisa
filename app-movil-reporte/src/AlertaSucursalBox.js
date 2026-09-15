import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome6 } from '@expo/vector-icons';
import { compartirWhatsapp } from './compartirWhatsapp';
import { REPORTE_URL, COLUMNAS_ORDEN } from './config';
import { COLORES } from './theme';

function hoyEcuador() {
  const d = new Date(Date.now() - 5 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

const GRADIENTE_NORMAL = ['#1E293B', '#0F172A'];
const GRADIENTE_ALERTA = ['#0E4C5C', '#0A2E3A'];

export default function AlertaSucursalBox({ sucursal, token, onSesionExpirada, onResultado }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [compartiendo, setCompartiendo] = useState(false);
  const capturaRef = useRef(null);

  useEffect(() => {
    let activo = true;
    fetch(`${REPORTE_URL}?fecha=${hoyEcuador()}&subsidiaryId=${sucursal.id}`, {
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
      .then((json) => { if (activo && json) setDatos(json); })
      .catch((e) => { if (activo) setError(e.message || 'No se pudo cargar el reporte'); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [sucursal.id, token]);

  function mensajeAlerta() {
    const esPlural = alertas.length > 1;
    const frase = esPlural
      ? 'por favor revisar las siguientes piscinas en la app'
      : 'por favor revisar la siguiente piscina en la app';
    return `${sucursal.nombre}: ${frase}`;
  }

  async function compartirPorWhatsApp() {
    if (!capturaRef.current) return;
    setCompartiendo(true);
    try {
      const uri = await captureRef(capturaRef, { format: 'png', quality: 1 });
      const mensaje = mensajeAlerta();
      await compartirWhatsapp(uri, mensaje, `Alertas ${sucursal.nombre}`);
    } catch (e) {
      setError('No se pudo generar la imagen para compartir');
    } finally {
      setCompartiendo(false);
    }
  }

  const alertas = datos?.alertas || [];
  const hayAlertas = alertas.length > 0;

  useEffect(() => {
    if (!cargando) onResultado(hayAlertas || !!error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando, hayAlertas, error]);

  if (cargando) {
    return (
      <View style={styles.cajaCargando}>
        <ActivityIndicator color={COLORES.acento} />
      </View>
    );
  }

  if (!error && !hayAlertas) {
    return null;
  }

  return (
    <View style={styles.caja}>
      <View style={styles.capturaWrapper}>
        <View ref={capturaRef} collapsable={false} style={styles.capturaBox}>
          <LinearGradient colors={hayAlertas ? GRADIENTE_ALERTA : GRADIENTE_NORMAL} style={styles.encabezado}>
            <Text style={styles.encabezadoTitulo}>{sucursal.nombre.toUpperCase()}</Text>
            <Text style={styles.encabezadoSub}>
              {`${datos?.fecha || ''}  ·  ${hayAlertas ? `${alertas.length} en alerta` : ''}`}
            </Text>
          </LinearGradient>

          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <View style={styles.tabla}>
              <View style={[styles.fila, styles.filaHeader]}>
                <Text style={[styles.celda, styles.celdaHeaderTexto, styles.colPsc]}>PSC</Text>
                {COLUMNAS_ORDEN.map((col) => (
                  <Text key={col} style={[styles.celda, styles.celdaHeaderTexto]}>{col}</Text>
                ))}
              </View>
              {alertas.map((fila, i) => (
                <View key={fila.PSC + i} style={[styles.fila, i % 2 === 0 && styles.filaPar]}>
                  <Text style={[styles.celda, styles.colPsc, styles.celdaPsc]}>{fila.PSC}</Text>
                  {COLUMNAS_ORDEN.map((col) => (
                    <Text key={col} style={[styles.celda, col === 'Saldo Tolva' && styles.celdaDestacada]}>
                      {fila[col] ?? 0}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.iconoWhatsapp, compartiendo && styles.botonDeshabilitado]}
          onPress={compartirPorWhatsApp}
          disabled={compartiendo}
          activeOpacity={0.8}
        >
          {compartiendo
            ? <ActivityIndicator size="small" color="#fff" />
            : <FontAwesome6 name="whatsapp" iconStyle="brand" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: {
    borderRadius: 14, marginBottom: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORES.tarjetaBorde,
  },
  cajaCargando: {
    backgroundColor: COLORES.tarjeta, borderRadius: 14, marginBottom: 16, padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: COLORES.tarjetaBorde,
  },
  capturaWrapper: { position: 'relative' },
  capturaBox: { backgroundColor: '#0F172A' },
  encabezado: { padding: 14, paddingRight: 44 },
  encabezadoTitulo: { color: '#fff', fontWeight: 'bold', fontSize: 13, textAlign: 'center', letterSpacing: 1 },
  encabezadoSub: { color: COLORES.acento, fontSize: 12, textAlign: 'center', marginTop: 4 },
  error: { color: COLORES.destacado, padding: 16, textAlign: 'center' },
  tabla: { paddingBottom: 8 },
  fila: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 6 },
  filaHeader: { backgroundColor: 'rgba(59,130,246,0.18)' },
  filaPar: { backgroundColor: 'rgba(255,255,255,0.03)' },
  celda: { flex: 1, fontSize: 11, textAlign: 'center', color: COLORES.texto },
  celdaHeaderTexto: { color: COLORES.acento, fontWeight: 'bold', fontSize: 10 },
  colPsc: { flex: 1.3, textAlign: 'left' },
  celdaPsc: { fontWeight: '600' },
  celdaDestacada: { fontWeight: 'bold', color: COLORES.destacado },
  iconoWhatsapp: {
    position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#25D366', justifyContent: 'center', alignItems: 'center',
  },
  botonDeshabilitado: { opacity: 0.6 },
});
