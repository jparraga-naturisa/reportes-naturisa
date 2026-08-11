import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import LoginScreen from './src/LoginScreen';
import SucursalPicker from './src/SucursalPicker';
import ReporteScreen from './src/ReporteScreen';
import GestionCorreos from './src/GestionCorreos';

export default function App() {
  const [token, setToken] = useState(null);
  const [sucursalesElegidas, setSucursalesElegidas] = useState(null);
  const [editandoCorreos, setEditandoCorreos] = useState(false);

  function cerrarSesion() {
    setToken(null);
    setSucursalesElegidas(null);
    setEditandoCorreos(false);
  }

  let pantalla;
  if (!token) {
    pantalla = <LoginScreen onLogin={setToken} />;
  } else if (editandoCorreos) {
    pantalla = <GestionCorreos onVolver={() => setEditandoCorreos(false)} />;
  } else if (!sucursalesElegidas) {
    pantalla = (
      <SucursalPicker
        onEjecutar={setSucursalesElegidas}
        onCerrarSesion={cerrarSesion}
        onEditarCorreos={() => setEditandoCorreos(true)}
      />
    );
  } else {
    pantalla = (
      <ReporteScreen
        sucursales={sucursalesElegidas}
        token={token}
        onVolver={() => setSucursalesElegidas(null)}
        onCerrarSesion={cerrarSesion}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {pantalla}
        <StatusBar style="auto" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
});
