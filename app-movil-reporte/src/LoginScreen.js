import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { LOGIN_URL, CODE_APPLICATION } from './config';

export default function LoginScreen({ onLogin }) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  async function ingresar() {
    const usuarioLimpio = usuario.trim();
    const passwordLimpio = password.trim();
    if (!usuarioLimpio || !passwordLimpio) {
      setError('Ingresa usuario y contraseña');
      return;
    }
    setCargando(true);
    setError('');
    try {
      const res = await fetch(LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          userName: usuarioLimpio,
          password: passwordLimpio,
          codeApplication: CODE_APPLICATION,
          includeUserInfo: true,
        }),
      });
      const data = await res.json();
      const token = data?.token || data?.accessToken || data?.access_token || data?.data?.token;
      if (!token) {
        throw new Error(data?.message || `Usuario o contraseña incorrectos (código ${data?.code ?? res.status})`);
      }
      onLogin(token);
    } catch (e) {
      if (e instanceof TypeError) {
        setError('No se pudo conectar al servidor. Revisa tu conexión a internet.');
      } else {
        setError(e.message || 'No se pudo iniciar sesión');
      }
    } finally {
      setCargando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.titulo}>Reporte Diario Naturisa</Text>

      <TextInput
        style={styles.input}
        placeholder="Usuario"
        autoCapitalize="none"
        value={usuario}
        onChangeText={setUsuario}
      />
      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity style={styles.boton} onPress={ingresar} disabled={cargando}>
        {cargando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>Ingresar</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F4F6F8' },
  titulo: { fontSize: 20, fontWeight: 'bold', color: '#4F6D8C', textAlign: 'center', marginBottom: 32 },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#D0D8E4', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, fontSize: 15,
  },
  boton: { backgroundColor: '#4F6D8C', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  botonTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  error: { color: '#3D5A75', marginBottom: 10, textAlign: 'center' },
});
