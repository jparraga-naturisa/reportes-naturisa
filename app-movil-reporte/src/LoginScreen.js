import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LOGIN_URL, CODE_APPLICATION } from './config';
import { COLORES, GRADIENTE_BOTON } from './theme';

export default function LoginScreen({ onLogin }) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
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
      <LinearGradient colors={GRADIENTE_BOTON} style={styles.insignia}>
        <Text style={styles.insigniaTexto}>📋</Text>
      </LinearGradient>
      <Text style={styles.titulo}>Reporte Diario</Text>
      <Text style={styles.lema}>ALERTAS DE PISCINAS</Text>
      <Text style={styles.subtitulo}>Ingresa con tu usuario de AP1</Text>

      <View style={styles.tarjeta}>
        <TextInput
          style={styles.input}
          placeholder="Usuario"
          placeholderTextColor={COLORES.textoMuted}
          autoCapitalize="none"
          value={usuario}
          onChangeText={setUsuario}
        />
        <View style={styles.filaPassword}>
          <TextInput
            style={styles.inputPassword}
            placeholder="Contraseña"
            placeholderTextColor={COLORES.textoMuted}
            secureTextEntry={!mostrarPassword}
            autoCapitalize="none"
            autoCorrect={false}
            importantForAutofill="no"
            textContentType="oneTimeCode"
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity style={styles.botonOjo} onPress={() => setMostrarPassword((v) => !v)}>
            <Text style={styles.ojoTexto}>{mostrarPassword ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity onPress={ingresar} disabled={cargando} activeOpacity={0.85}>
          <LinearGradient colors={GRADIENTE_BOTON} style={styles.boton}>
            {cargando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>Ingresar</Text>}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  insignia: {
    width: 96, height: 96, borderRadius: 48,
    justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 14,
    shadowColor: COLORES.acento, shadowOpacity: 0.6, shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
  },
  insigniaTexto: { fontSize: 40 },
  titulo: { fontSize: 22, fontWeight: 'bold', color: COLORES.texto, textAlign: 'center' },
  lema: {
    fontSize: 12, fontWeight: 'bold', color: COLORES.acento, textAlign: 'center',
    letterSpacing: 2, marginTop: 4, marginBottom: 10,
  },
  subtitulo: { fontSize: 13, color: COLORES.textoMuted, textAlign: 'center', marginBottom: 24 },
  tarjeta: {
    backgroundColor: COLORES.tarjeta, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: COLORES.tarjetaBorde,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, borderWidth: 1, borderColor: COLORES.tarjetaBorde,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, fontSize: 15, color: COLORES.texto,
  },
  filaPassword: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10,
    borderWidth: 1, borderColor: COLORES.tarjetaBorde, marginBottom: 14,
  },
  inputPassword: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORES.texto },
  botonOjo: { paddingHorizontal: 12, paddingVertical: 12 },
  ojoTexto: { fontSize: 18 },
  boton: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  botonTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  error: { color: COLORES.destacado, marginBottom: 10, textAlign: 'center' },
});
