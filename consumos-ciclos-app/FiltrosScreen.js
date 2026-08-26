import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { apiGet } from '../api';

export default function FiltrosScreen({ navigation }) {
  const [loading, setLoading]   = useState(true);
  const [subs, setSubs]         = useState([]);
  const [ciclos, setCiclos]     = useState([]);
  const [subId, setSubId]       = useState('');
  const [pool, setPool]         = useState('');
  const [cicloId, setCicloId]   = useState('');
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    cargar();
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={cerrarSesion} style={{ marginRight: 4 }}>
          <Text style={{ color: '#94a3b8', fontSize: 15 }}>⎋ Salir</Text>
        </TouchableOpacity>
      ),
    });
  }, []);

  async function cerrarSesion() {
    await AsyncStorage.multiRemove(['nat_token', 'nat_user']);
    navigation.replace('Login');
  }

  async function cargar() {
    setLoading(true);
    try {
      const [rs, rProd, rCos] = await Promise.all([
        apiGet('/db/sucursales'),
        apiGet('/db/ciclos?estado=PRODUCCION'),
        apiGet('/db/ciclos?estado=COSECHADO'),
      ]);
      const byId = {};
      (rs.data || []).forEach(s => { byId[s.id] = s; });

      const mapCiclo = c => ({
        id:     c.id_ciclo,
        codigo: c.codigo_ciclo || String(c.id_ciclo),
        pool:   c.nombre_piscina || '',
        ha:     c.tamano_piscina || 0,
        dias:   c.dias_ciclo || c.dias_produccion || 0,
        estado: c.estado || '',
        fecha:  c.fecha_inicio_ciclo || c.fecha_inicio || c.start_date || '',
        subId:  c.id_sucursal,
        sub:    (byId[c.id_sucursal] || {}).nombre || '',
      });

      const produccion = (rProd.data || []).map(mapCiclo);
      const cosechado  = (rCos.data  || []).map(mapCiclo)
        .filter(c => c.fecha && String(c.fecha).startsWith('2026'));

      const mapped = [...produccion, ...cosechado];
      const subsActivas = Object.values(byId)
        .filter(s => mapped.some(c => c.subId === s.id))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      setSubs(subsActivas);
      setCiclos(mapped);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  const pools = useCallback(() => {
    if (!subId) return [];
    const set = [...new Set(ciclos.filter(c => String(c.subId) === subId && c.pool).map(c => c.pool))];
    return set.sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  }, [subId, ciclos]);

  const ciclosFilt = useCallback(() => {
    let f = ciclos;
    if (subId) f = f.filter(c => String(c.subId) === subId);
    if (pool)  f = f.filter(c => c.pool === pool);
    return f.sort((a, b) => b.id - a.id);
  }, [subId, pool, ciclos]);

  function onSubChange(v) { setSubId(v); setPool(''); setCicloId(''); }
  function onPoolChange(v) { setPool(v); setCicloId(''); }

  async function buscar() {
    if (!subId) { Alert.alert('Atención', 'Selecciona una sucursal'); return; }
    let lista = ciclos.filter(c => String(c.subId) === subId);
    if (pool)    lista = lista.filter(c => c.pool === pool);
    if (cicloId) lista = lista.filter(c => String(c.id) === cicloId);
    if (!lista.length) { Alert.alert('Sin resultados', 'No hay ciclos con esos filtros'); return; }
    if (lista.length > 15) { Alert.alert('Demasiados ciclos', 'Selecciona una piscina o ciclo específico (' + lista.length + ' ciclos)'); return; }
    const titulo = cicloId ? lista[0].codigo : pool ? pool : lista[0].sub;
    setBuscando(true);
    try {
      const resultados = [];
      for (const c of lista) {
        const r = await apiGet('/db/consumo-insumos?idCiclo=' + c.id);
        resultados.push({ ciclo: c, rows: r.data || [] });
      }
      navigation.navigate('Resultados', { resultados, titulo });
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setBuscando(false);
    }
  }

  if (loading) return (
    <View style={s.center}>
      <ActivityIndicator size="large" color="#3b82f6" />
      <Text style={s.loadTxt}>Cargando sucursales…</Text>
    </View>
  );

  const poolList  = pools();
  const cicloList = ciclosFilt();

  return (
    <View style={s.wrap}>
      <ScrollView style={s.scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

        <Text style={s.label}>Sucursal *</Text>
        <View style={s.pick}>
          <Picker selectedValue={subId} onValueChange={onSubChange} style={s.picker} dropdownIconColor="#94a3b8">
            <Picker.Item label="— Selecciona sucursal —" value="" color="#475569" />
            {subs.map(s => <Picker.Item key={s.id} label={s.nombre} value={String(s.id)} />)}
          </Picker>
        </View>

        <Text style={s.label}>Piscina</Text>
        <View style={[s.pick, !subId && s.pickDis]}>
          <Picker selectedValue={pool} onValueChange={onPoolChange} style={s.picker} enabled={!!subId} dropdownIconColor="#94a3b8">
            <Picker.Item label="— Todas las piscinas —" value="" color="#475569" />
            {poolList.map(p => <Picker.Item key={p} label={p} value={p} />)}
          </Picker>
        </View>

        <Text style={s.label}>Ciclo</Text>
        <View style={[s.pick, !subId && s.pickDis]}>
          <Picker selectedValue={cicloId} onValueChange={setCicloId} style={s.picker} enabled={!!subId} dropdownIconColor="#94a3b8">
            <Picker.Item label="— Todos los ciclos —" value="" color="#475569" />
            {cicloList.map(c => <Picker.Item key={c.id} label={c.codigo + (c.ha ? ' · ' + c.ha.toFixed(1) + ' Ha' : '')} value={String(c.id)} />)}
          </Picker>
        </View>

      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity style={[s.btn, buscando && s.btnDis]} onPress={buscar} disabled={buscando}>
          {buscando
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnTxt}>🔍 Buscar</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:    { flex: 1, backgroundColor: '#0f172a' },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a', gap: 14 },
  loadTxt: { color: '#94a3b8', fontSize: 16 },
  scroll:  { flex: 1 },
  body:    { padding: 20, gap: 6 },
  label:   { fontSize: 13, fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  pick:    { backgroundColor: '#1e293b', borderWidth: 1.5, borderColor: '#334155', borderRadius: 14, overflow: 'hidden' },
  pickDis: { opacity: 0.4 },
  picker:  { color: '#f8fafc', height: 56 },
  footer:  { padding: 16, paddingBottom: 28, backgroundColor: '#0f172a', borderTopWidth: 1, borderTopColor: '#1e293b' },
  btn:     { backgroundColor: '#3b82f6', borderRadius: 16, padding: 18, alignItems: 'center' },
  btnDis:  { backgroundColor: '#334155' },
  btnTxt:  { fontSize: 18, fontWeight: '700', color: '#fff' },
});
