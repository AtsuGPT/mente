import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Endereço do backend (Next.js), resolvido nesta ordem:
 *  1. EXPO_PUBLIC_API_URL (mobile/.env): internet ou produção, ex. https://minhamente.space;
 *  2. aberto por túnel do Expo (expo start --tunnel): o servidor de produção, já que o
 *     túnel só leva o app, não o backend;
 *  3. o IP do computador que serve o app no Expo Go (mesma rede Wi-Fi) + EXPO_PUBLIC_API_PORT;
 *  4. localhost, apenas para o navegador do próprio computador (expo start --web).
 * No iPhone, "localhost" seria o próprio celular — por isso ele nunca é o padrão no dispositivo.
 */

const port = process.env.EXPO_PUBLIC_API_PORT || "3000";
const PRODUCTION_API = "https://minhamente.space";

function devServerHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(":")[0];
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  return host;
}

/**
 * Túnel do Expo (*.exp.direct, *.on.expo.app ou outro domínio que venha a usar): qualquer
 * endereço que não seja um IP da rede local. Na mesma Wi-Fi o Expo Go recebe o IP do computador.
 */
const isExpoTunnel = (host: string) => !/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && !host.endsWith(".local");

function resolveApiUrl() {
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "");
  if (explicit) return { url: explicit, source: "EXPO_PUBLIC_API_URL" as const };
  const host = devServerHost();
  if (host && isExpoTunnel(host)) return { url: PRODUCTION_API, source: "túnel do Expo" as const };
  if (host) return { url: `http://${host}:${port}`, source: "rede local" as const };
  return { url: `http://localhost:${port}`, source: Platform.OS === "web" ? ("navegador local" as const) : ("padrão" as const) };
}

const resolved = resolveApiUrl();

export const API_URL = resolved.url;
export const API_SOURCE = resolved.source;
/** Tempo máximo de uma requisição comum (as respostas da IA usam streaming e não têm este limite). */
export const REQUEST_TIMEOUT_MS = 20_000;

export function absoluteUrl(path: string) {
  return /^https?:\/\//.test(path) ? path : `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}
