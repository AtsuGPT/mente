import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Token da sessão no Keychain (iOS) / Keystore (Android) via expo-secure-store.
 * No navegador (expo start --web, usado só para testes) cai para localStorage.
 */

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Sem armazenamento no navegador: a sessão dura só esta aba.
    }
    return;
  }
  await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
}

export async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Nada a remover.
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
