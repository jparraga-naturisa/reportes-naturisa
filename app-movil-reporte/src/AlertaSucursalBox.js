import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { compartirWhatsapp } from './compartirWhatsapp';
import { REPORTE_URL, COLUMNAS_ORDEN } from './config';

function hoyEcuador() {
  const d = new Date(Date.now() - 5 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

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
        <ActivityIndicator color="#4F6D8C" />
      </View>
    );
  }

  if (!error && !hayAlertas) {
    return null;
  }

  return (
    <View style={styles.caja}>
      <View ref={capturaRef} collapsable={false} style={styles.capturaBox}>
        <View style={[styles.encabezado, hayAlertas && styles.encabezadoAlerta]}>
          <Text style={styles.encabezadoTitulo}>{sucursal.nombre.toUpperCase()}</Text>
          <Text style={styles.encabezadoSub}>
            {`${datos?.fecha || ''}  ·  ${hayAlertas ? `${alertas.length} en alerta` : ''}`}
          </Text>
        </View>

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
              <View key={fila.PSC + i} style={[styles.fila, i % 2 === 0 ? styles.filaPar : styles.filaImpar]}>
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
        style={[styles.botonWhatsapp, compartiendo && styles.botonDeshabilitado]}
        onPress={compartirPorWhatsApp}
        disabled={compartiendo}
      >
        {compartiendo
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.botonWhatsappTexto}>Compartir por WhatsApp</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { backgroundColor: '#fff', borderRadius: 10, marginBottom: 16, overflow: 'hidden' },
  cajaCargando: { backgroundColor: '#fff', borderRadius: 10, marginBottom: 16, padding: 16, alignItems: 'center' },
  capturaBox: { backgroundColor: '#fff' },
  encabezado: { backgroundColor: '#4F6D8C', padding: 14 },
  encabezadoAlerta: { backgroundColor: '#2F4B66' },
  encabezadoTitulo: { color: '#fff', fontWeight: 'bold', fontSize: 13, textAlign: 'center', letterSpacing: 1 },
  encabezadoSub: { color: '#D0D8E4', fontSize: 12, textAlign: 'center', marginTop: 4 },
  error: { color: '#3D5A75', padding: 16, textAlign: 'center' },
  tabla: { paddingBottom: 8 },
  fila: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 6 },
  filaHeader: { backgroundColor: '#6E96B8' },
  filaPar: { backgroundColor: '#F2F2F2' },
  filaImpar: { backgroundColor: '#fff' },
  celda: { flex: 1, fontSize: 11, textAlign: 'center', color: '#222' },
  celdaHeaderTexto: { color: '#fff', fontWeight: 'bold', fontSize: 10 },
  colPsc: { flex: 1.3, textAlign: 'left' },
  celdaPsc: { fontWeight: '600' },
  celdaDestacada: { fontWeight: 'bold', color: '#3D5A75' },
  botonWhatsapp: {
    backgroundColor: '#4E9B6F', paddingVertical: 12, justifyContent: 'center', alignItems: 'center',
  },
  botonWhatsappTexto: { color: '#fff', fontWeight: 'bold' },
  botonDeshabilitado: { opacity: 0.6 },
});
