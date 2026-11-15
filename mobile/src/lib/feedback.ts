import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * Retorno tátil da Mente, num lugar só (sem exageros: só onde a ação muda algo).
 *
 *   select   escolher entre opções (filtros, chips, nós do mapa, abas)
 *   tap      ação pontual que não navega (botões de ícone, abrir o painel pelo gesto)
 *   success  algo concluído e guardado (publicar, salvar)
 *
 * Na web não há vibração: tudo vira nada. Falhas do motor (modo silencioso, aparelho sem motor) são ignoradas.
 */
const enabled = Platform.OS !== "web";

export const feedback = {
  select() {
    if (enabled) void Haptics.selectionAsync().catch(() => undefined);
  },
  tap() {
    if (enabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  },
  success() {
    if (enabled) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
};

/**
 * De onde o post foi aberto (a altura do toque no cartão), para a página "crescer" a partir dele. Vale só para a
 * próxima abertura e por pouco tempo: um post aberto por link ou pela busca entra normal.
 */
let origin: { y: number; at: number } | null = null;

export function markOrigin(pageY: number) {
  origin = { y: pageY, at: Date.now() };
}

export function takeOrigin() {
  const found = origin;
  origin = null;
  return found && Date.now() - found.at < 1_500 ? found : null;
}
