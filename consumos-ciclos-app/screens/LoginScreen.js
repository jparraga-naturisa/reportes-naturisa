import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { AUTH, CAPP } from '../api';

export default function LoginScreen({ navigation }) {
  const [usuario, setUsuario] = useState('');
  const [pass, setPass]       = useState('');
  const [loading, setLoading] = useState(false);
  const passRef = useRef(null);

  useEffect(() => {
    (async () => {
      const t = await AsyncStorage.getItem('nat_token');
      const u = await AsyncStorage.getItem('nat_user');
      if (t) {
        if (u) setUsuario(u);
        navigation.replace('Filtros');
      }
    })();
  }, []);

  async function login() {
    if (!usuario.trim() || !pass.trim()) {
      Alert.alert('Atención', 'Ingresa usuario y contraseña'); return;
    }
    setLoading(true);
    try {
      const r = await fetch(AUTH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ userName: usuario.trim(), password: pass.trim(), codeApplication: CAPP, includeUserInfo: true }),
      });
      const j = await r.json();
      if (j.code === 200 && j.data?.token) {
        await AsyncStorage.setItem('nat_token', j.data.token);
        await AsyncStorage.setItem('nat_user', usuario.trim());
        navigation.replace('Filtros');
      } else {
        Alert.alert('Error', 'Usuario o contraseña incorrectos');
      }
    } catch (e) {
      Alert.alert('Error de conexión', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.box}>
        <Text style={s.ico}>🦐</Text>
        <Text style={s.titulo}>Consumos por Ciclo</Text>
        <Text style={s.sub}>Inicia sesión con tu usuario AP1</Text>

        <Text style={s.label}>Usuario</Text>
        <TextInput
          style={s.input} value={usuario} onChangeText={setUsuario}
          autoCapitalize="none" autoCorrect={false} returnKeyType="next"
          onSubmitEditing={() => passRef.current?.focus()}
          placeholder="Usuario" placeholderTextColor="#475569"
        />

        <Text style={s.label}>Contraseña</Text>
        <TextInput
          ref={passRef} style={s.input} value={pass} onChangeText={setPass}
          secureTextEntry autoCapitalize="none" returnKeyType="go"
          onSubmitEditing={login}
          placeholder="Contraseña" placeholderTextColor="#475569"
        />

        <TouchableOpacity style={[s.btn, loading && s.btnDis]} onPress={login} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnTxt}>Ingresar</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap:   { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', padding: 28 },
  box:    { width: '100%', maxWidth: 400 },
  ico:    { fontSize: 60, textAlign: 'center' },
  titulo: { fontSize: 26, fontWeight: '800', color: '#f8fafc', textAlign: 'center', marginTop: 12 },
  sub:    { fontSize: 15, color: '#94a3b8', textAlign: 'center', marginTop: 8, marginBottom: 32 },
  label:  { fontSize: 13, fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  input:  { backgroundColor: '#1e293b', borderWidth: 1.5, borderColor: '#334155', borderRadius: 14,
            padding: 16, fontSize: 17, color: '#f8fafc', marginBottom: 18 },
  btn:    { backgroundColor: '#3b82f6', borderRadius: 16, padding: 18, alignItems: 'center', marginTop: 6 },
  btnDis: { backgroundColor: '#334155' },
  btnTxt: { fontSize: 18, fontWeight: '700', color: '#fff' },
});
