import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Pressable } from 'react-native';
import { fmt$, fmt2 } from '../api';

function mIcon(d) {
  d = (d || '').toLowerCase();
  if (d.includes('balanceado') || d.includes('alimento')) return '🐟';
  if (d.includes('oxigeno') || d.includes('oxíge'))       return '💨';
  if (d.includes('calcio') || d.includes('carbonato'))    return '🪨';
  if (d.includes('cloro'))                                return '🧪';
  if (d.includes('dolomita'))                             return '⛰️';
  if (d.includes('larva') || d.includes('nauplio'))       return '🦐';
  if (d.includes('diesel') || d.includes('combustible'))  return '⛽';
  if (d.includes('probiotico') || d.includes('vitamina')) return '💊';
  return '📦';
}

export default function ResultadosScreen({ route, navigation }) {
  const { resultados = [] } = route.params || {};
  const [idx, setIdx] = useState(0);

  const total = resultados.length;
  const { ciclo, rows } = resultados[idx] || { ciclo: {}, rows: [] };

  const prev = () => setIdx(i => Math.max(0, i - 1));
  const next = () => setIdx(i => Math.min(total - 1, i + 1));

  // Actualiza el título del header con piscina + ciclo
  navigation.setOptions({
    header: () => (
      <View style={s.hdrWrap}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.closeRow}>
          <View style={s.closeBtn}>
            <Text style={s.closeTxt}>✕</Text>
          </View>
          <Text style={s.closeLabel}>Salir</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={prev} disabled={idx === 0} style={s.navBtn}>
          <Text style={[s.navArr, idx === 0 && s.navDis]}>‹</Text>
        </TouchableOpacity>
        <View style={s.navInfo}>
          <Text style={s.navPool} numberOfLines={1}>{ciclo.pool || '—'}</Text>
          <Text style={s.navCiclo} numberOfLines={1}>{ciclo.codigo || ''}</Text>
        </View>
        <TouchableOpacity onPress={next} disabled={idx === total - 1} style={s.navBtn}>
          <Text style={[s.navArr, idx === total - 1 && s.navDis]}>›</Text>
        </TouchableOpacity>
      </View>
    ),
  });

  const totalCosto = rows.reduce((a, x) => a + (x.importe || 0), 0);
  const totalHa    = ciclo.ha || 0;

  const renderCiclo = () => {
    const dias  = ciclo.dias || 30;
    const haDay = ciclo.ha > 0 && dias > 0 ? totalCosto / (ciclo.ha * dias) : null;
    const mats  = {};
    rows.forEach(r => {
      const k = r.codigo_material || '?';
      if (!mats[k]) mats[k] = { code: k, desc: r.descripcion || k, u: r.unidad || '', costo: 0, cant: 0, rawRows: [] };
      mats[k].costo += r.importe || 0;
      mats[k].cant  += r.cantidad || 0;
      mats[k].rawRows.push(r);
    });
    const arr = Object.values(mats).sort((a, b) => b.costo - a.costo);
    const max = arr[0]?.costo || 1;
    return (
      <View style={s.card}>
        <View style={[s.pills, { paddingTop: 12 }]}>
          <View style={[s.badge, ciclo.estado === 'COSECHADO' ? s.badgeCos : ciclo.estado === 'SECA' ? s.badgeSeca : {}]}>
            <Text style={s.badgeTxt}>{ciclo.estado || 'PROD'}</Text>
          </View>
          <View style={s.pill}><Text style={s.pillTxt}>📐 <Text style={s.pillB}>{fmt2(ciclo.ha)} Ha</Text></Text></View>
          <View style={s.pill}><Text style={s.pillTxt}>📅 <Text style={s.pillB}>{dias} días</Text></Text></View>
        </View>
        {arr.length > 0 ? (
          <>
            <Text style={s.matTitle}>Insumos</Text>
            {arr.map(m => (
              <Pressable key={m.code} style={({ pressed }) => [s.mrow, pressed && { backgroundColor: '#263548' }]}
                onPress={() => navigation.navigate('Detalle', { material: m.desc, rows: m.rawRows, pool: ciclo.pool, codigo: ciclo.codigo })}>
                <View style={s.mico}><Text style={{ fontSize: 22 }}>{mIcon(m.desc)}</Text></View>
                <View style={s.minfo}>
                  <Text style={s.mname}>{m.desc}</Text>
                  <Text style={s.mcode}>{fmt2(m.cant)} {m.u}</Text>
                  <View style={s.barW}><View style={[s.bar, { width: Math.round(m.costo / max * 100) + '%' }]} /></View>
                </View>
                <View style={s.mnums}>
                  <Text style={s.mcosto}>{fmt$(m.costo)}</Text>
                  <Text style={s.mha}>{ciclo.ha > 0 ? '$' + fmt2(m.costo / ciclo.ha) + '/Ha' : ''}</Text>
                  <Text style={s.mver}>Ver detalle ›</Text>
                </View>
              </Pressable>
            ))}
          </>
        ) : (
          <Text style={s.noData}>Sin consumos registrados</Text>
        )}
      </View>
    );
  };

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.body}>
      <View style={s.kpis}>
        <View style={s.kpi}>
          <Text style={s.kl}>Total</Text>
          <Text style={[s.kv, { color: '#34d399' }]}>{'$' + totalCosto.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
        </View>
        <View style={s.kpi}>
          <Text style={s.kl}>$/Ha</Text>
          <Text style={s.kv}>{totalHa > 0 && totalCosto > 0 ? fmt$(totalCosto / totalHa) : '—'}</Text>
        </View>
      </View>
      {total > 0 && renderCiclo()}
      <Text style={s.counter}>{idx + 1} de {total}</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap:     { flex: 1, backgroundColor: '#0f172a' },
  body:     { padding: 12, paddingBottom: 32 },

  // Header custom
  hdrWrap:    { backgroundColor: '#1e3a5f' },
  closeRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0f172a', paddingTop: 48, paddingBottom: 5, paddingHorizontal: 16 },
  closeBtn:   { width: 18, height: 18, borderRadius: 9, backgroundColor: '#7f1d1d', alignItems: 'center', justifyContent: 'center' },
  closeTxt:   { color: '#fca5a5', fontSize: 10, fontWeight: '700', lineHeight: 12 },
  closeLabel: { color: '#64748b', fontSize: 11 },
  navRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 10 },
  navBtn:     { padding: 4 },
  navArr:     { fontSize: 30, color: '#f8fafc', fontWeight: '300', lineHeight: 34 },
  navDis:     { color: '#334155' },
  navInfo:    { flex: 1, alignItems: 'center' },
  navPool:    { fontSize: 17, fontWeight: '700', color: '#f8fafc', textAlign: 'center' },
  navCiclo:   { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 1 },

  kpis:     { flexDirection: 'row', gap: 10, marginBottom: 12 },
  kpi:      { flex: 1, backgroundColor: '#1e293b', borderRadius: 14, padding: 14 },
  kl:       { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  kv:       { fontSize: 20, fontWeight: '800', color: '#f8fafc' },

  counter:  { textAlign: 'center', fontSize: 13, color: '#475569', marginTop: 12 },

  card:     { backgroundColor: '#1e293b', borderRadius: 16, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' },
  chdr:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  badge:    { backgroundColor: '#3b82f6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeCos: { backgroundColor: '#16a34a' },
  badgeSeca:{ backgroundColor: '#64748b' },
  badgeTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cinfo:    { flex: 1 },
  codigo:   { fontSize: 17, fontWeight: '700', color: '#f8fafc' },
  csub:     { fontSize: 13, color: '#94a3b8', marginTop: 2 },
  ccost:    { alignItems: 'flex-end' },
  costoV:   { fontSize: 19, fontWeight: '800', color: '#34d399' },
  costoHa:  { fontSize: 12, color: '#94a3b8', marginTop: 2 },

  pills:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
  pill:     { backgroundColor: '#0f172a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  pillTxt:  { fontSize: 13, color: '#94a3b8' },
  pillB:    { color: '#f8fafc', fontWeight: '600' },

  matTitle: { fontSize: 13, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 14, paddingVertical: 8 },
  mrow:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: '#334155' },
  mico:     { width: 44, height: 44, backgroundColor: '#1e3a5f', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  minfo:    { flex: 1 },
  mname:    { fontSize: 15, fontWeight: '600', color: '#f8fafc', lineHeight: 20 },
  mcode:    { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  barW:     { height: 4, backgroundColor: '#334155', borderRadius: 2, marginTop: 5 },
  bar:      { height: '100%', backgroundColor: '#3b82f6', borderRadius: 2 },
  mnums:    { alignItems: 'flex-end' },
  mcosto:   { fontSize: 17, fontWeight: '800', color: '#34d399' },
  mha:      { fontSize: 12, color: '#94a3b8', marginTop: 3 },
  mver:     { fontSize: 11, color: '#3b82f6', marginTop: 4 },
  noData:   { fontSize: 14, color: '#64748b', padding: 14, borderTopWidth: 1, borderTopColor: '#334155' },
});
