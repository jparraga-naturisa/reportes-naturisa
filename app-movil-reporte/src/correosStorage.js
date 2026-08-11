import AsyncStorage from '@react-native-async-storage/async-storage';
import { CORREOS_POR_DEFECTO } from './config';

const CLAVE = 'correos-alerta';

export async function obtenerCorreos() {
  try {
    const guardado = await AsyncStorage.getItem(CLAVE);
    if (guardado) return JSON.parse(guardado);
  } catch (e) {
    // si falla la lectura, se usa la lista por defecto
  }
  return CORREOS_POR_DEFECTO;
}

export async function guardarCorreos(correos) {
  await AsyncStorage.setItem(CLAVE, JSON.stringify(correos));
}
