import { useMemo } from "react";
import { useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { easing } from "@/theme/motion";

/**
 * Estados visuais da Kally, ligados a eventos reais do app:
 *  - idle: em repouso.
 *  - listening: gravando a voz da pessoa (reage ao nível real do microfone).
 *  - thinking: pedido enviado, nenhum texto chegou ainda (ou anexo sendo lido).
 *  - responding: texto do streaming chegando.
 *  - speaking: reprodução de voz da Kally. O app ainda não reproduz áudio; o estado existe
 *    para quando houver, e usa o mesmo `level` (amplitude real) do listening.
 *  - error: a última resposta falhou.
 */
export type KallyOrbitalState = "idle" | "listening" | "thinking" | "responding" | "speaking" | "error";

/**
 * Pulso de atividade do streaming: chame kick() a cada pedaço de texto recebido. O valor sobe
 * rápido e decai devagar, então o ritmo real da geração aparece na órbita (rajadas aceleram,
 * pausas acalmam) sem nada simulado.
 */
export function useKallyActivity() {
  const activity = useSharedValue(0);
  return useMemo(
    () => ({
      activity,
      kick: () => {
        activity.value = withSequence(withTiming(1, { duration: 90, easing: easing.standard }), withTiming(0, { duration: 900, easing: easing.decelerate }));
      },
    }),
    [activity],
  );
}

/** Nível do microfone em dB (−160…0) → 0…1, com piso de ruído. */
export function levelFromMetering(db: number | undefined) {
  if (db == null || !Number.isFinite(db)) return 0;
  return Math.min(1, Math.max(0, (db + 52) / 46));
}
