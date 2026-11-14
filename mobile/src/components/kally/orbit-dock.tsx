import { useCallback, useEffect, type ReactNode } from "react";
import { StyleSheet, type LayoutChangeEvent } from "react-native";
import Animated, { FadeIn, FadeOut, ReduceMotion, useAnimatedReaction, useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { AppText } from "@/components/ui/primitives";
import { spring } from "@/theme/motion";
import { colors } from "@/theme/tokens";

/**
 * A presença da Kally na conversa (redesenho de 14/11/2026). A órbita flutua por cima da coluna, num tamanho só
 * (desenhada grande e reduzida por escala, para as linhas ficarem nítidas), e vai para um de três lugares:
 *
 *   - topo (padrão): centralizada abaixo do cabeçalho, com a frase curta de estado logo abaixo dela;
 *   - centro (escutando): maior, no meio da conversa, que esmaece; balança de leve com a intensidade da voz;
 *   - canto (teclado aberto no celular, sem resposta em andamento): pequena, acima da caixa de texto, e a faixa do
 *     topo se recolhe para o teclado não roubar o espaço da conversa. No computador o foco do campo não a move.
 *
 * Tudo na UI thread: as posições vêm de medidas de layout guardadas em valores compartilhados e cada destino tem um
 * peso com mola (interrompível); a posição é a mistura dos três. Com "reduzir movimento", as molas viram troca direta.
 */

export const ORBIT_SIZE = 48;

/** Troca da frase: a anterior sai rápido e a nova entra logo depois, no mesmo lugar (sem as duas se sobreporem). */
export const phraseIn = FadeIn.duration(260).delay(130).reduceMotion(ReduceMotion.System);
export const phraseOut = FadeOut.duration(130).reduceMotion(ReduceMotion.System);

type Options = {
  keyboardInset: SharedValue<number>;
  level: SharedValue<number>;
  listening: boolean;
  answering: boolean;
  gutter: number;
  /** Tela larga (notebook, monitor): órbita maior e mais expressiva. */
  wide: boolean;
};

export function useKallyPresence({ keyboardInset, level, listening, answering, gutter, wide }: Options) {
  const canvas = wide ? 260 : 196;
  /** Escala no topo e no canto. */
  const bandScale = wide ? 0.46 : 0.42;
  const cornerScale = 66 / canvas;
  const bandOrb = canvas * bandScale;
  /** Altura da faixa do topo: a órbita (sem a margem do halo) e uma linha de frase. */
  const bandHeight = Math.round(bandOrb * 0.78 + 32);

  const width = useSharedValue(0);
  const full = useSharedValue(0);
  const bottom = useSharedValue(0);
  const bandY = useSharedValue(0);
  const listY = useSharedValue(0);
  const listH = useSharedValue(0);
  const ready = useSharedValue(0);
  const busy = useSharedValue(answering ? 1 : 0);
  const hearing = useSharedValue(listening ? 1 : 0);
  const toCorner = useSharedValue(0);
  const toCenter = useSharedValue(0);
  const swayX = useSharedValue(0);
  const swayY = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    busy.value = answering ? 1 : 0;
  }, [answering, busy]);
  useEffect(() => {
    hearing.value = listening ? 1 : 0;
    toCenter.value = reduceMotion ? (listening ? 1 : 0) : withSpring(listening ? 1 : 0, spring.sheet);
  }, [listening, hearing, toCenter, reduceMotion]);

  // Canto: só com o teclado de verdade aberto (no computador, o foco do campo não muda nada).
  useAnimatedReaction(
    () => keyboardInset.value > 40 && busy.value === 0 && hearing.value === 0,
    (corner, previous) => {
      if (corner !== previous) toCorner.value = reduceMotion ? (corner ? 1 : 0) : withSpring(corner ? 1 : 0, spring.sheet);
    },
  );

  // Balanço enquanto escuta: lento e proporcional à voz (Lissajous), nada aleatório.
  const sway = useFrameCallback((info) => {
    "worklet";
    const t = info.timestamp / 1000;
    const amp = canvas * (wide ? 0.08 : 0.05) * level.value;
    swayX.value = Math.sin(t * 0.9) * amp;
    swayY.value = Math.sin(t * 1.7) * amp * 0.4;
  }, false);
  useEffect(() => {
    sway.setActive(listening && !reduceMotion);
    if (!listening) {
      swayX.value = withTiming(0, { duration: 400 });
      swayY.value = withTiming(0, { duration: 400 });
    }
  }, [listening, reduceMotion, sway, swayX, swayY]);

  const onColumnLayout = useCallback(
    (event: LayoutChangeEvent) => {
      width.value = event.nativeEvent.layout.width;
      full.value = event.nativeEvent.layout.height + keyboardInset.value;
    },
    [width, full, keyboardInset],
  );
  const onBandLayout = useCallback(
    (event: LayoutChangeEvent) => {
      bandY.value = event.nativeEvent.layout.y;
      ready.value = withTiming(1, { duration: 320 });
    },
    [bandY, ready],
  );
  const onListLayout = useCallback(
    (event: LayoutChangeEvent) => {
      listY.value = event.nativeEvent.layout.y;
      listH.value = event.nativeEvent.layout.height;
    },
    [listY, listH],
  );
  const onBottomLayout = useCallback(
    (event: LayoutChangeEvent) => {
      bottom.value = event.nativeEvent.layout.height;
    },
    [bottom],
  );

  /** Só valores compartilhados e números: é o que os worklets de posição leem. */
  const geo = { canvas, bandScale, cornerScale, bandOrb, gutter, width, full, bottom, bandY, listY, listH, ready, toCorner, toCenter, swayX, swayY, level, keyboardInset };
  return { geo, canvas, bandHeight, toCorner, toCenter, onColumnLayout, onBandLayout, onListLayout, onBottomLayout };
}

export type KallyPresence = ReturnType<typeof useKallyPresence>;

type Geo = KallyPresence["geo"];

/** Posição (centro) e escala da órbita agora, misturando os três destinos. */
function place(p: Geo) {
  "worklet";
  const wC = p.toCorner.value;
  const wL = p.toCenter.value;
  const wB = Math.max(0, 1 - wC - wL);
  const height = p.full.value - p.keyboardInset.value;
  const bandX = p.width.value / 2;
  const bandY = p.bandY.value + p.bandOrb * 0.39;
  const centerX = p.width.value / 2 + p.swayX.value;
  const centerY = p.listY.value + p.listH.value * 0.42 + p.swayY.value;
  const cornerVis = p.canvas * p.cornerScale;
  const cornerX = p.width.value - p.gutter - cornerVis * 0.5;
  const cornerY = height - p.bottom.value - cornerVis * 0.45 - 6;
  return {
    x: bandX * wB + cornerX * wC + centerX * wL,
    y: bandY * wB + cornerY * wC + centerY * wL,
    s: p.bandScale * wB + p.cornerScale * wC + (1 + 0.12 * p.level.value) * wL,
    corner: wC,
  };
}

/** Lugar da faixa do topo no layout (recolhe quando a órbita vai para o canto). */
export function PresenceBand({ presence }: { presence: KallyPresence }) {
  const { bandHeight, toCorner } = presence;
  const style = useAnimatedStyle(() => ({ height: bandHeight * (1 - toCorner.value) }));
  return <Animated.View onLayout={presence.onBandLayout} style={style} pointerEvents="none" />;
}

/** A conversa esmaece enquanto a Kally escuta (a órbita vai para o meio dela). */
export function usePresenceDim(presence: KallyPresence) {
  const { toCenter } = presence;
  return useAnimatedStyle(() => ({ opacity: 1 - toCenter.value * 0.78 }));
}

/** A órbita flutuante e a frase de estado logo abaixo dela. */
export function PresenceLayer({ presence, status, children }: { presence: KallyPresence; status: string; children: ReactNode }) {
  const { geo } = presence;
  const size = geo.canvas;
  const orb = useAnimatedStyle(() => {
    const at = place(geo);
    return { opacity: geo.ready.value, transform: [{ translateX: at.x - size / 2 }, { translateY: at.y - size / 2 }, { scale: at.s }] };
  });
  const line = useAnimatedStyle(() => {
    const at = place(geo);
    return {
      width: geo.width.value,
      opacity: geo.ready.value * (1 - at.corner),
      transform: [{ translateY: at.y + size * at.s * 0.39 + 2 }],
    };
  });
  return (
    <>
      <Animated.View pointerEvents="box-none" style={[styles.orb, { width: size, height: size }, orb]}>
        {children}
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.line, line]}>
        {status ? (
          <Animated.View key={status} entering={phraseIn} exiting={phraseOut} style={styles.phrase}>
            <AppText variant="small" color={colors.muted} numberOfLines={1} style={styles.lineText}>{status}</AppText>
          </Animated.View>
        ) : null}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  orb: { position: "absolute", left: 0, top: 0, zIndex: 5 },
  line: { position: "absolute", left: 0, top: 0, zIndex: 5, alignItems: "center", paddingHorizontal: 24 },
  phrase: { position: "absolute", left: 24, right: 24, top: 0, alignItems: "center" },
  lineText: { textAlign: "center", letterSpacing: 0.1 },
});
