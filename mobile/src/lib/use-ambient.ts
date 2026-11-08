import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useIsFocused } from "expo-router";
import { useReducedMotion } from "react-native-reanimated";

/** App em primeiro plano (na web: aba visível). */
export function useAppActive() {
  const [active, setActive] = useState(AppState.currentState !== "background");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setActive(state === "active"));
    return () => subscription.remove();
  }, []);
  return active;
}

/**
 * Animações ambientais (laços contínuos) só rodam com a tela em foco, o app em primeiro
 * plano e sem "reduzir movimento". Abas continuam montadas fora de foco: sem isto, os
 * laços seguiriam gastando quadros e bateria em telas que ninguém está vendo.
 * Só pode ser usado dentro de uma tela (precisa do contexto de navegação).
 */
export function useAmbientActive() {
  const focused = useIsFocused();
  const appActive = useAppActive();
  const reduceMotion = useReducedMotion();
  return focused && appActive && !reduceMotion;
}
