import AsyncStorage from '@react-native-async-storage/async-storage';
import { CORREOS_COSECHA_PARA_POR_DEFECTO, CORREOS_COSECHA_CC_POR_DEFECTO } from './config';

const CLAVE_COSECHA_PARA = 'correos-cosecha-para';
const CLAVE_COSECHA_CC = 'correos-cosecha-cc';

async function leer(clave, porDefecto) {
  try {
    const guardado = await AsyncStorage.getItem(clave);
    if (guardado) return JSON.parse(guardado);
  } catch (e) {
    // si falla la lectura, se usa la lista por defecto
  }
  return porDefecto;
}

export async function obtenerCorreosCosechaPara() {
  return leer(CLAVE_COSECHA_PARA, CORREOS_COSECHA_PARA_POR_DEFECTO);
}

export async function guardarCorreosCosechaPara(correos) {
  await AsyncStorage.setItem(CLAVE_COSECHA_PARA, JSON.stringify(correos));
}

export async function obtenerCorreosCosechaCc() {
  return leer(CLAVE_COSECHA_CC, CORREOS_COSECHA_CC_POR_DEFECTO);
}

export async function guardarCorreosCosechaCc(correos) {
  await AsyncStorage.setItem(CLAVE_COSECHA_CC, JSON.stringify(correos));
}
