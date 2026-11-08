import { useCallback, useEffect, type ReactNode } from "react";
import type { LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from "react-native-reanimated";
import { enter, spring } from "@/theme/motion";

export const ORBIT_SIZE = 48;

/**
 * A órbita da Kally como presença na tela de conversa: fica no cabeçalho e, quando o teclado abre
 * (ou o campo ganha foco na web), desliza para o canto direito, logo acima da caixa de texto,
 * como quem chega perto para ouvir. Enquanto a Kally responde, volta ao cabeçalho.
 *
 * Tudo roda na UI thread: as duas posições vêm de medidas de layout guardadas em valores
 * compartilhados, e o canto acompanha o teclado quadro a quadro (a coluna encolhe com ele). A
 * troca é uma mola criticamente amortecida com um arco curto, interrompível no meio do caminho.
 * Com "reduzir movimento", a mola vira troca imediata (ReduceMotion.System no spring).
 */
export function useOrbitDock({ keyboardInset, composerFocus, answering, gutter }: { keyboardInset: SharedValue<number>; composerFocus: SharedValue<number>; answering: boolean; gutter: number }) {
  const slotX = useSharedValue(0);
  const slotY = useSharedValue(0);
  const width = useSharedValue(0);
  const full = useSharedValue(0);
  const bottom = useSharedValue(0);
  const ready = useSharedValue(0);
  const busy = useSharedValue(answering ? 1 : 0);
  const progress = useSharedValue(0);

  useEffect(() => {
    busy.value = answering ? 1 : 0;
  }, [answering, busy]);

  useAnimatedReaction(
    () => (keyboardInset.value > 40 || composerFocus.value > 0.5) && busy.value === 0,
    (toCorner, previous) => {
      if (toCorner !== previous) progress.value = withSpring(toCorner ? 1 : 0, spring.sheet);
    },
  );

  // O cabeçalho é o primeiro filho da coluna: a posição do lugar dentro dele já é a posição na coluna.
  const onSlotLayout = useCallback(
    (event: LayoutChangeEvent) => {
      slotX.value = event.nativeEvent.layout.x;
      slotY.value = event.nativeEvent.layout.y;
      ready.value = 1;
    },
    [slotX, slotY, ready],
  );
  // Altura da coluna sem teclado (a medida soma o que o teclado já ocupava naquele instante).
  const onColumnLayout = useCallback(
    (event: LayoutChangeEvent) => {
      width.value = event.nativeEvent.layout.width;
      full.value = event.nativeEvent.layout.height + keyboardInset.value;
    },
    [width, full, keyboardInset],
  );
  const onBottomLayout = useCallback(
    (event: LayoutChangeEvent) => {
      bottom.value = event.nativeEvent.layout.height;
    },
    [bottom],
  );

  return { slotX, slotY, width, full, bottom, ready, progress, keyboardInset, gutter, onSlotLayout, onColumnLayout, onBottomLayout };
}

type Orbit = ReturnType<typeof useOrbitDock>;

export function OrbitDock({ orbit, children }: { orbit: Orbit; children: ReactNode }) {
  const { slotX, slotY, width, full, bottom, ready, progress, keyboardInset, gutter } = orbit;
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const height = full.value - keyboardInset.value;
    const cornerX = width.value - gutter - ORBIT_SIZE;
    const cornerY = height - bottom.value - ORBIT_SIZE - 8;
    // Arco curto no meio do trajeto: o movimento parece de quem se desloca, não de um slide reto.
    const arc = Math.sin(p * Math.PI) * 14;
    return {
      opacity: ready.value,
      transform: [
        { translateX: slotX.value + (cornerX - slotX.value) * p - arc * 0.4 },
        { translateY: slotY.value + (cornerY - slotY.value) * p - arc },
        { scale: 1 - p * 0.08 },
      ],
    };
  });
  return (
    // Posição animada por fora; a entrada (esmaecer) por dentro: as duas não disputam a opacidade.
    <Animated.View pointerEvents="box-none" style={[{ position: "absolute", left: 0, top: 0, width: ORBIT_SIZE, height: ORBIT_SIZE, zIndex: 5 }, style]}>
      <Animated.View entering={enter.fade} pointerEvents="box-none">
        {children}
      </Animated.View>
    </Animated.View>
  );
}
