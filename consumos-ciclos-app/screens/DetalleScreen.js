import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { fmt$, fmt2 } from '../api';

function fmtFecha(f) {
  if (!f) return '—';
  const d = new Date(f);
  if (isNaN(d)) return String(f).slice(0, 10);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function DetalleScreen({ route }) {
  const { material, rows } = route.params || {};
  const total    = rows.reduce((s, r) => s + (r.importe || 0), 0);
  const totalCant = rows.reduce((s, r) => s + (r.cantidad || 0), 0);
  const unidad   = rows[0]?.unidad || '';

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.body}>

      {/* Resumen */}
      <View style={s.resumen}>
        <View style={s.ritem}>
          <Text style={s.rl}>Total cantidad</Text>
          <Text style={s.rv}>{fmt2(totalCant)} {unidad}</Text>
        </View>
        <View style={s.sep} />
        <View style={s.ritem}>
          <Text style={s.rl}>Total costo</Text>
          <Text style={[s.rv, { color: '#34d399' }]}>{fmt$(total)}</Text>
        </View>
      </View>

      {/* Título tabla */}
      <View style={s.thead}>
        <Text style={[s.th, { flex: 1.4 }]}>Fecha</Text>
        <Text style={[s.th, { flex: 1, textAlign: 'right' }]}>Cantidad</Text>
        <Text style={[s.th, { flex: 1, textAlign: 'right' }]}>Costo</Text>
      </View>

      {/* Filas */}
      {rows.map((r, i) => (
        <View key={i} style={[s.row, i % 2 === 1 && s.rowAlt]}>
          <Text style={[s.td, { flex: 1.4 }]}>{fmtFecha(r.fecha || r.fecha_movimiento || r.fecha_documento)}</Text>
          <Text style={[s.td, { flex: 1, textAlign: 'right' }]}>{fmt2(r.cantidad)} {r.unidad || ''}</Text>
          <Text style={[s.td, { flex: 1, textAlign: 'right', color: '#34d399' }]}>{fmt$(r.importe || 0)}</Text>
        </View>
      ))}

    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap:    { flex: 1, backgroundColor: '#0f172a' },
  body:    { padding: 14, paddingBottom: 40 },

  resumen: { backgroundColor: '#1e293b', borderRadius: 14, borderWidth: 1, borderColor: '#334155', marginBottom: 16, overflow: 'hidden' },
  ritem:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  sep:     { height: 1, backgroundColor: '#334155' },
  rl:      { fontSize: 13, color: '#94a3b8' },
  rv:      { fontSize: 16, fontWeight: '700', color: '#f8fafc', fontVariant: ['tabular-nums'] },

  thead:   { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#334155' },
  th:      { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 },

  row:     { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  rowAlt:  { backgroundColor: '#1e293b22' },
  td:      { fontSize: 14, color: '#f1f5f9', fontVariant: ['tabular-nums'] },
});
