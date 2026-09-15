import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator, Text, BackHandler } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import LoginScreen from './src/LoginScreen';
import MenuReportes from './src/MenuReportes';
import ReporteScreen from './src/ReporteScreen';
import { obtenerSucursales } from './src/sucursalesApi';
import { COLORES, GRADIENTE_FONDO } from './src/theme';

export default function App() {
  const [token, setToken] = useState(null);
  const [reporteTipo, setReporteTipo] = useState(null);
  const [sucursales, setSucursales] = useState(null);
  const [cargandoTodas, setCargandoTodas] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');

  useEffect(() => {
    if (!reporteTipo || sucursales) return;
    let activo = true;
    setCargandoTodas(true);
    setErrorCarga('');
    obtenerSucursales()
      .then((lista) => { if (activo) setSucursales(lista); })
      .catch(() => { if (activo) setErrorCarga('No se pudo cargar la lista de sucursales'); })
      .finally(() => { if (activo) setCargandoTodas(false); });
    return () => { activo = false; };
  }, [reporteTipo, sucursales]);

  function cerrarSesion() {
    setToken(null);
    setReporteTipo(null);
    setSucursales(null);
  }

  function cambiarReporte() {
    setReporteTipo(null);
    setSucursales(null);
  }

  useEffect(() => {
    const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => {
      if (reporteTipo) {
        cambiarReporte();
        return true;
      }
      // En el menu de reportes (pantalla raiz) se deja el comportamiento normal (salir/minimizar).
      return false;
    });
    return () => suscripcion.remove();
  }, [reporteTipo]);

  let pantalla;
  if (!token) {
    pantalla = <LoginScreen onLogin={setToken} />;
  } else if (!reporteTipo) {
    pantalla = <MenuReportes onSeleccionar={setReporteTipo} onCerrarSesion={cerrarSesion} />;
  } else if (cargandoTodas || (!sucursales && !errorCarga)) {
    pantalla = (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={COLORES.acento} />
      </View>
    );
  } else if (errorCarga) {
    pantalla = (
      <View style={styles.centro}>
        <Text style={styles.errorTexto}>{errorCarga}</Text>
      </View>
    );
  } else {
    pantalla = (
      <ReporteScreen
        tipo={reporteTipo}
        sucursales={sucursales}
        token={token}
        onCambiarReporte={cambiarReporte}
        onCerrarSesion={cerrarSesion}
      />
    );
  }

  return (
    <LinearGradient colors={GRADIENTE_FONDO} style={styles.gradiente}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          {pantalla}
          <StatusBar style="light" />
        </SafeAreaView>
      </SafeAreaProvider>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradiente: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent' },
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorTexto: { color: COLORES.destacado, textAlign: 'center', paddingHorizontal: 24 },
});
