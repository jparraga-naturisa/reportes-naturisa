import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import LoginScreen from './screens/LoginScreen';
import FiltrosScreen from './screens/FiltrosScreen';
import ResultadosScreen from './screens/ResultadosScreen';
import DetalleScreen from './screens/DetalleScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: { backgroundColor: '#1e3a5f' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700', fontSize: 18 },
          contentStyle: { backgroundColor: '#0f172a' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Filtros" component={FiltrosScreen} options={{ title: '🦐 Consumos por Ciclo' }} />
        <Stack.Screen name="Resultados" component={ResultadosScreen} options={({ route }) => ({ title: route.params?.titulo || 'Resultados' })} />
        <Stack.Screen name="Detalle" component={DetalleScreen} options={({ route }) => ({
          headerTitle: () => (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: '#94a3b8', fontSize: 11 }}>{route.params?.codigo}</Text>
              <Text style={{ color: '#f8fafc', fontSize: 16, fontWeight: '700' }} numberOfLines={1}>{route.params?.material}</Text>
            </View>
          ),
        })} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
