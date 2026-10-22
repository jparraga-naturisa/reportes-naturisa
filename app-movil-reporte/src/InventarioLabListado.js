import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { FontAwesome6 } from '@expo/vector-icons';
import * as MailComposer from 'expo-mail-composer';
import { INVENTARIO_LAB_URL } from './config';
import { COLORES } from './theme';

function numero(v) {
  const redondeado = Math.round(v * 1000) / 1000;
  const [entero, dec] = Math.abs(redondeado).toFixed(3).split('.');
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const texto = dec === '000' ? conMiles : `${conMiles}.${dec}`;
  return redondeado < 0 ? `-${texto}` : texto;
}

export default function InventarioLabListado({ token, onSesionExpirada }) {
  const [laboratorios, setLaboratorios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');
  const [soloDiferencias, setSoloDiferencias] = useState(false);
  const [enviandoInforme, setEnviandoInforme] = useState(false);

  const cargar = useCallback((mostrarSpinnerGrande) => {
    if (mostrarSpinnerGrande) setCargando(true);
    setError('');
    return fetch(INVENTARIO_LAB_URL, {
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
      .then((json) => { if (json) setLaboratorios(json.laboratorios || []); })
      .catch((e) => setError(e.message || 'No se pudo cargar el inventario'))
      .finally(() => { setCargando(false); setRefrescando(false); });
  }, [token, onSesionExpirada]);

  useEffect(() => { cargar(true); }, [cargar]);

  function onRefrescar() {
    setRefrescando(true);
    cargar(false);
  }

  async function enviarCorreoLaboratorio(lab) {
    const conDif = lab.filas.filter((f) => f.diferencia !== 0);
    const detalle = conDif
      .map((f) => `- ${f.material} ${f.descripcion}: ${numero(f.diferencia)} ${f.unidad}`)
      .join('\n');
    const cuerpo = `Buen día,\n\nEn ${lab.nombre} (${lab.almacen}) los siguientes materiales tienen diferencia entre SAP y el laboratorio, favor realizar el ajuste correspondiente:\n\n${detalle}\n\nMotivo: \n\nSaludos.`;
    try {
      const disponible = await MailComposer.isAvailableAsync();
      if (!disponible) {
        setError('No hay una app de correo configurada en este dispositivo');
        return;
      }
      await MailComposer.composeAsync({
        subject: `Ajuste de inventario - ${lab.nombre} (${lab.almacen})`,
        body: cuerpo,
      });
    } catch (e) {
      setError('No se pudo abrir el correo');
    }
  }

  function tablaHtmlLaboratorio(lab) {
    const abrev = lab.nombre.replace('Larviquest ', 'LQ');
    const TD = 'padding:10px 14px; border:1px solid #ddd; font-size:14px; font-weight:bold;';
    const TDR = TD + ' text-align:right;';
    const TDC = TD + ' text-align:center;';

    const conSaldo = lab.filas
      .filter((f) => f.stockSap !== 0 || f.stockLab !== 0 || f.consumosNoEnviados !== 0 || f.diferencia !== 0);

    if (!conSaldo.length) {
      return `
    <div style="margin-bottom:28px;">
      <div style="background:#2F2F2F; padding:12px 18px; border-radius:4px 4px 0 0; text-align:center;">
        <b style="color:#FFFFFF; font-size:17px; letter-spacing:1px;">${abrev}</b>
      </div>
      <div style="border:1px solid #ddd; border-top:none; padding:16px; background:#FAFAFA; border-radius:0 0 4px 4px; text-align:center;">
        <p style="margin:0; font-size:14px; font-weight:bold; color:#888; font-style:italic;">
          ${lab.sinProduccion ? 'Ciclo en fase de secado — sin producción activa' : 'Sin saldos'}
        </p>
      </div>
    </div>`;
    }

    let totalSap = 0, totalLab = 0, totalNoEnv = 0, totalDif = 0;
    const filas = conSaldo
      .map((f, i) => {
        totalSap += f.stockSap; totalLab += f.stockLab; totalNoEnv += f.consumosNoEnviados; totalDif += f.diferencia;
        const bg = i % 2 === 0 ? '#F0F4F8' : '#FFFFFF';
        const tdDif = f.diferencia !== 0 ? TD + ' color:#C00000;' : TD;
        return `
        <tr style="background:${bg};">
            <td style="${TD}">${f.material}</td>
            <td style="${TD} white-space:nowrap;">${f.descripcion}</td>
            <td style="${TDC}">${f.unidad}</td>
            <td style="${TDR}">${numero(f.stockSap)}</td>
            <td style="${TDR}">${numero(f.stockLab)}</td>
            <td style="${TDR}">${numero(f.consumosNoEnviados)}</td>
            <td style="${tdDif} text-align:right;">${numero(f.diferencia)}</td>
        </tr>`;
      })
      .join('');

    const TT = 'padding:11px 14px; border:1px solid #163a5f; font-size:15px; font-weight:bold; text-align:right; background:#1F4E79; color:#FFFFFF;';
    const totalRow = `
        <tr>
            <td style="${TT} text-align:center; min-width:110px;">TOTAL</td>
            <td style="${TT} min-width:320px;"></td>
            <td style="${TT} min-width:55px;"></td>
            <td style="${TT} min-width:110px;">${numero(totalSap)}</td>
            <td style="${TT} min-width:140px;">${numero(totalLab)}</td>
            <td style="${TT} min-width:160px;">${numero(totalNoEnv)}</td>
            <td style="${TT} min-width:110px; color:#FFD700;">${numero(totalDif)}</td>
        </tr>`;

    const TH = 'padding:11px 14px; border:1px solid #1a5c9e; font-size:14px; text-align:center;';
    return `
    <div style="margin-bottom:32px;">
      <div style="background:#1F4E79; padding:14px 18px; border-radius:4px 4px 0 0; text-align:center;">
        <b style="color:#FFFFFF; font-size:18px; letter-spacing:2px;">${abrev}</b>
      </div>
      <table style="width:100%; border-collapse:collapse; border:1px solid #ddd; border-top:none; table-layout:fixed;">
        <colgroup>
          <col style="width:11%;"><col style="width:33%;"><col style="width:5%;">
          <col style="width:12%;"><col style="width:14%;"><col style="width:14%;"><col style="width:11%;">
        </colgroup>
        <thead>
          <tr style="background:#2E75B6; color:#FFFFFF;">
            <th style="${TH}">Material</th>
            <th style="${TH}">Descripción del material</th>
            <th style="${TH}">UM</th>
            <th style="${TH}">Stock SAP</th>
            <th style="${TH}">Stock Laboratorio</th>
            <th style="${TH}">Consumos no Enviados</th>
            <th style="${TH}">Diferencias</th>
          </tr>
        </thead>
        <tbody>${filas}${totalRow}</tbody>
      </table>
    </div>`;
  }

  async function enviarCorreoCompleto() {
    if (!laboratorios.length) {
      setError('No hay datos cargados para enviar');
      return;
    }
    setEnviandoInforme(true);
    setError('');
    try {
      const fecha = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const tablasHtml = laboratorios.map(tablaHtmlLaboratorio).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>
<div style="font-family:Arial, sans-serif; width:100%;">
  <div style="background:#1a1a2e; padding:22px 24px; border-radius:6px 6px 0 0; margin-bottom:24px; text-align:center;">
    <h2 style="color:#FFFFFF; margin:0; font-size:20px; font-weight:bold; letter-spacing:2px;">
      CONTROL DE BODEGAS DE PRODUCCION LABORATORIOS
    </h2>
    <p style="color:#8AB8D8; margin:8px 0 0; font-size:14px; font-weight:bold;">Fecha: ${fecha}</p>
  </div>
  ${tablasHtml}
</div>
</body></html>`;

      const archivo = new File(Paths.cache, `control-bodegas-${fecha}.html`);
      archivo.write(html);

      const disponible = await MailComposer.isAvailableAsync();
      if (!disponible) {
        setError('No hay una app de correo configurada en este dispositivo');
        return;
      }
      await MailComposer.composeAsync({
        subject: `Control de Bodegas de Produccion Laboratorios — ${fecha}`,
        body: 'Buen día,\n\nAdjunto el control de bodegas de producción de laboratorios.\n\nSaludos.',
        attachments: [archivo.uri],
      });
    } catch (e) {
      setError('No se pudo generar el informe para enviar');
    } finally {
      setEnviandoInforme(false);
    }
  }

  if (cargando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={COLORES.acento} />
        <Text style={styles.cargandoTexto}>Consultando saldos SAP...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefrescar} tintColor={COLORES.acento} />}
    >
      <Text style={styles.titulo}>Stock SAP vs stock del laboratorio</Text>

      <TouchableOpacity
        style={[styles.botonInforme, enviandoInforme && { opacity: 0.6 }]}
        onPress={enviarCorreoCompleto}
        disabled={enviandoInforme}
        activeOpacity={0.85}
      >
        {enviandoInforme ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <FontAwesome6 name="envelope" size={18} color="#fff" />
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.filtro} onPress={() => setSoloDiferencias((v) => !v)} activeOpacity={0.8}>
        <FontAwesome6 name={soloDiferencias ? 'square-check' : 'square'} size={16} color={COLORES.acento} />
        <Text style={styles.filtroTexto}>Solo materiales con diferencia</Text>
      </TouchableOpacity>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {laboratorios.map((lab) => {
        const filas = (soloDiferencias ? lab.filas.filter((f) => f.diferencia !== 0) : lab.filas)
          .filter((f) => f.stockSap !== 0 || f.stockLab !== 0);
        return (
          <View key={lab.subsidiaryId} style={styles.tarjeta}>
            <View style={styles.tarjetaEncabezado}>
              <View style={{ flex: 1 }}>
                <Text style={styles.labNombre}>{lab.nombre}</Text>
                <Text style={styles.labDetalle}>
                  {lab.almacen}{lab.ciclo ? ` · Ciclo ${lab.ciclo}` : ''}{lab.cicloEstado ? ` (${lab.cicloEstado})` : ''}{lab.sinProduccion ? ' · sin producción' : ''}
                </Text>
              </View>
              <View style={[styles.contador, lab.conDiferencia > 0 && styles.contadorAlerta]}>
                <Text style={[styles.contadorTexto, lab.conDiferencia > 0 && styles.contadorTextoAlerta]}>
                  {lab.conDiferencia}
                </Text>
              </View>
              {lab.conDiferencia > 0 && (
                <TouchableOpacity style={styles.colIcono} onPress={() => enviarCorreoLaboratorio(lab)}>
                  <FontAwesome6 name="envelope" size={18} color={COLORES.acento} />
                </TouchableOpacity>
              )}
            </View>

            {filas.length === 0 ? (
              <Text style={styles.sinFilas}>
                {soloDiferencias ? 'Sin diferencias.' : 'Sin materiales.'}
              </Text>
            ) : (
              <>
                <View style={[styles.fila, styles.filaHeader]}>
                  <Text style={[styles.celda, styles.celdaHeaderTexto]}>SAP</Text>
                  <Text style={[styles.celda, styles.celdaHeaderTexto]}>Lab</Text>
                  <Text style={[styles.celda, styles.celdaHeaderTexto]}>No env.</Text>
                  <Text style={[styles.celda, styles.celdaHeaderTexto]}>Dif.</Text>
                </View>
                {filas.map((f, i) => (
                  <View key={f.material} style={[styles.bloque, i % 2 === 0 && styles.filaPar]}>
                    <Text
                      style={[styles.material, f.diferencia !== 0 && styles.materialDestacado]}
                      numberOfLines={1}
                    >
                      <Text style={[styles.materialCodigo, f.diferencia !== 0 && styles.materialDestacado]}>{f.material}</Text>  {f.descripcion}
                      <Text style={styles.unidad}>  ({f.unidad})</Text>
                    </Text>
                    <View style={styles.fila}>
                      <Text style={styles.celda}>{numero(f.stockSap)}</Text>
                      <Text style={styles.celda}>{numero(f.stockLab)}</Text>
                      <Text style={styles.celda}>{numero(f.consumosNoEnviados)}</Text>
                      <Text style={[styles.celda, f.diferencia !== 0 && styles.celdaDestacada]}>{numero(f.diferencia)}</Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cargandoTexto: { color: COLORES.textoMuted, marginTop: 12, fontSize: 12 },
  scroll: { padding: 12, paddingBottom: 24 },
  titulo: { fontSize: 15, fontWeight: 'bold', color: COLORES.texto, textAlign: 'center', marginBottom: 10 },
  botonInforme: {
    width: 44, height: 44, borderRadius: 22, alignSelf: 'center', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORES.acento, marginBottom: 12,
  },
  filtro: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', paddingVertical: 6, marginBottom: 10 },
  filtroTexto: { color: COLORES.texto, fontSize: 13 },
  error: { color: COLORES.destacado, padding: 16, textAlign: 'center' },
  tarjeta: {
    backgroundColor: COLORES.tarjeta, borderRadius: 12, overflow: 'hidden', marginBottom: 14,
    borderWidth: 1, borderColor: COLORES.tarjetaBorde,
  },
  tarjetaEncabezado: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: COLORES.tarjetaBorde,
  },
  labNombre: { color: COLORES.texto, fontWeight: 'bold', fontSize: 14 },
  labDetalle: { color: COLORES.textoMuted, fontSize: 11, marginTop: 2 },
  contador: {
    minWidth: 30, height: 30, borderRadius: 15, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORES.acentoSuave,
  },
  contadorAlerta: { backgroundColor: 'rgba(251,191,36,0.18)' },
  contadorTexto: { color: COLORES.acento, fontWeight: 'bold', fontSize: 13 },
  contadorTextoAlerta: { color: COLORES.destacado },
  sinFilas: { color: COLORES.acento, textAlign: 'center', padding: 14, fontSize: 13, fontWeight: '600' },
  fila: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 6 },
  filaHeader: { backgroundColor: 'rgba(59,130,246,0.18)', paddingVertical: 6 },
  filaPar: { backgroundColor: COLORES.filaPar },
  bloque: { paddingTop: 6, paddingBottom: 2 },
  material: { color: COLORES.texto, fontSize: 11, paddingHorizontal: 8 },
  materialDestacado: { fontSize: 13, fontWeight: 'bold', color: COLORES.destacado },
  materialCodigo: { color: COLORES.acento, fontWeight: 'bold' },
  unidad: { color: COLORES.textoMuted },
  celda: { flex: 1, fontSize: 11, textAlign: 'center', color: COLORES.texto },
  celdaHeaderTexto: { color: COLORES.acento, fontWeight: 'bold', fontSize: 10 },
  celdaDestacada: { fontWeight: 'bold', color: COLORES.destacado },
  colIcono: { width: 32, alignItems: 'center' },
});
