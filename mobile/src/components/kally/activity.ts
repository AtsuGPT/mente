import { useMemo } from "react";
import { Easing, useSharedValue, withSequence, withTiming } from "react-native-reanimated";

/**
 * Estados visuais da Kally, ligados a eventos reais do app:
 *  - idle: em repouso.
 *  - listening: gravando a voz da pessoa (reage ao nível real do microfone).
 *  - thinking: pedido enviado, nenhum texto chegou ainda (entendendo, planejando, esperando o modelo).
 *  - memory: a Kally usou memórias e pensamentos do ambiente (etapa "resumo" do servidor).
 *  - research: buscando fontes na internet (etapas post-fontes e post-pesquisa, ou o resumo citando fontes).
 *  - docs: lendo um anexo ou documento (anexo sendo processado, revisão de texto).
 *  - post: escrevendo ou revisando o rascunho de um post (etapas post-leu, rascunho e revisao).
 *  - responding: texto do streaming chegando.
 *  - speaking: reprodução de voz da Kally. O app ainda não reproduz áudio; o estado existe
 *    para quando houver, e usa o mesmo `level` (amplitude real) do listening.
 *  - error: a última resposta falhou.
 */
export type KallyOrbitalState = "idle" | "listening" | "thinking" | "memory" | "research" | "docs" | "post" | "responding" | "speaking" | "error";

/**
 * Atividade do streaming (0–1): chame kick() a cada pedaço de texto recebido. Cada pedaço
 * soma um pouco ao nível atual e depois o nível desce devagar; com o texto chegando, ele
 * sobe aos poucos até um patamar proporcional ao ritmo real da geração, e ao terminar volta
 * ao repouso em ~2,5 s. A órbita ainda suaviza esse sinal (ver orbital-skia).
 */
const RISE = { duration: 220, easing: Easing.linear };
const FALL = { duration: 2400, easing: Easing.inOut(Easing.quad) };
export function useKallyActivity() {
  const activity = useSharedValue(0);
  return useMemo(
    () => ({
      activity,
      kick: () => {
        activity.value = withSequence(withTiming(Math.min(1, activity.value + 0.12), RISE), withTiming(0, FALL));
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
