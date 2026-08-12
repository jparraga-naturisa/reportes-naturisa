import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import * as MailComposer from 'expo-mail-composer';
import { compartirWhatsappTexto } from './compartirWhatsapp';
import { COSECHA_URL } from './config';
import { obtenerCorreosCosechaPara, obtenerCorreosCosechaCc } from './correosStorage';

function numeroCiclo(cycleCode) {
  const partes = (cycleCode || '').split('-');
  return parseInt(partes[partes.length - 1], 10) || partes[partes.length - 1];
}

export default function AlertaCosechaBox({ sucursal, token, onSesionExpirada, onResultado }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [compartiendo, setCompartiendo] = useState(false);
  const [enviandoCorreo, setEnviandoCorreo] = useState(false);

  useEffect(() => {
    let activo = true;
    fetch(`${COSECHA_URL}?subsidiaryId=${sucursal.id}`, {
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
      .catch((e) => { if (activo) setError(e.message || 'No se pudo cargar las cosechas'); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [sucursal.id, token]);

  const alertas = datos?.alertas || [];
  const hayAlertas = alertas.length > 0;

  useEffect(() => {
    if (!cargando) onResultado(hayAlertas || !!error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando, hayAlertas, error]);

  function mensajeAlerta() {
    const esPlural = alertas.length > 1;
    const ciclos = alertas.map((a) => a.cycleCode).join(', ');
    const frase = esPlural
      ? `los ciclos ${ciclos}, ¿cuándo se realizará la cosecha final?`
      : `el ciclo ${ciclos}, ¿cuándo se realizará la cosecha final?`;
    return `${sucursal.nombre}: ${frase}`;
  }

  async function compartirPorWhatsApp() {
    setCompartiendo(true);
    try {
      await compartirWhatsappTexto(mensajeAlerta());
    } catch (e) {
      setError('No se pudo compartir el mensaje');
    } finally {
      setCompartiendo(false);
    }
  }

  function cuerpoCorreo() {
    const parrafos = alertas.map((a) =>
      `Por favor, tu ayuda realizando la modificación del ciclo de cosecha ${a.cycleCode} ` +
      `(Piscina ${a.poolName}, Ciclo ${numeroCiclo(a.cycleCode)}), cambiando el tipo de cosecha de Pre-Final a Parcial.\n\n` +
      `Esto se debe a que la cosecha final está programada para el día ______, por lo que se excederá el ` +
      `período de 7 días permitido entre la cosecha Pre-Final y la cosecha Final.`
    );
    return `Hola, buenos días.\n\n${parrafos.join('\n\n')}\n\nAgradezco mucho tu apoyo con esta gestión.`;
  }

  async function compartirPorCorreo() {
    setEnviandoCorreo(true);
    try {
      const disponible = await MailComposer.isAvailableAsync();
      if (!disponible) {
        setError('No hay una app de correo configurada en este dispositivo');
        return;
      }
      const [para, cc] = await Promise.all([obtenerCorreosCosechaPara(), obtenerCorreosCosechaCc()]);
      await MailComposer.composeAsync({
        recipients: para,
        ccRecipients: cc,
        subject: `Modificación cosecha Pre-Final a Parcial - ${sucursal.nombre}`,
        body: cuerpoCorreo(),
      });
    } catch (e) {
      setError('No se pudo enviar el correo');
    } finally {
      setEnviandoCorreo(false);
    }
  }

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
      <View style={styles.capturaBox}>
        <View style={[styles.encabezado, hayAlertas && styles.encabezadoAlerta]}>
          <Text style={styles.encabezadoTitulo}>{sucursal.nombre.toUpperCase()} · COSECHAS</Text>
          <Text style={styles.encabezadoSub}>
            {hayAlertas ? `${alertas.length} Pre-Final sin Final` : ''}
          </Text>
        </View>

        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <View style={styles.tabla}>
            <View style={[styles.fila, styles.filaHeader]}>
              <Text style={[styles.celda, styles.celdaHeaderTexto, styles.colCiclo]}>Ciclo</Text>
              <Text style={[styles.celda, styles.celdaHeaderTexto]}>Piscina</Text>
              <Text style={[styles.celda, styles.celdaHeaderTexto]}>Fecha Pre-Final</Text>
              <Text style={[styles.celda, styles.celdaHeaderTexto]}>Días</Text>
            </View>
            {alertas.map((fila, i) => (
              <View key={fila.cycleCode + i} style={[styles.fila, i % 2 === 0 ? styles.filaPar : styles.filaImpar]}>
                <Text style={[styles.celda, styles.colCiclo, styles.celdaCiclo]}>{fila.cycleCode}</Text>
                <Text style={styles.celda}>{fila.poolName}</Text>
                <Text style={styles.celda}>{fila.fechaPreFinal}</Text>
                <Text style={[styles.celda, fila.diasTranscurridos > 7 && styles.celdaDestacada]}>
                  {fila.diasTranscurridos}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.filaBotones}>
        <TouchableOpacity
          style={[styles.botonWhatsapp, compartiendo && styles.botonDeshabilitado]}
          onPress={compartirPorWhatsApp}
          disabled={compartiendo}
        >
          {compartiendo
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.botonWhatsappTexto}>WhatsApp</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.botonCorreo, enviandoCorreo && styles.botonDeshabilitado]}
          onPress={compartirPorCorreo}
          disabled={enviandoCorreo}
        >
          {enviandoCorreo
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.botonCorreoTexto}>Correo</Text>}
        </TouchableOpacity>
      </View>
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
  colCiclo: { flex: 1.3, textAlign: 'left' },
  celdaCiclo: { fontWeight: '600' },
  celdaDestacada: { fontWeight: 'bold', color: '#3D5A75' },
  filaBotones: { flexDirection: 'row' },
  botonWhatsapp: {
    flex: 1, backgroundColor: '#4E9B6F', paddingVertical: 12, justifyContent: 'center', alignItems: 'center',
  },
  botonWhatsappTexto: { color: '#fff', fontWeight: 'bold' },
  botonCorreo: {
    flex: 1, backgroundColor: '#4F6D8C', paddingVertical: 12, justifyContent: 'center', alignItems: 'center',
  },
  botonCorreoTexto: { color: '#fff', fontWeight: 'bold' },
  botonDeshabilitado: { opacity: 0.6 },
});
