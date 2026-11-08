import { useEffect } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";
import { useAmbientActive } from "@/lib/use-ambient";
import { easing } from "@/theme/motion";
import { colors } from "@/theme/tokens";

/**
 * Pulsos de luz roxa no fundo: manchas difusas (círculos concêntricos de baixa opacidade,
 * sem bibliotecas extras) que respiram devagar em intensidade, tamanho e posição. Fica atrás
 * do conteúdo e não recebe toques. Pausa fora de foco e com "reduzir movimento".
 * Só transform e opacity animam (nada de layout nem desfoque a cada quadro).
 */
const BLOBS: { style: ViewStyle; size: number; color: string; duration: number; delay: number; drift: [number, number] }[] = [
  { style: { top: -140, left: -110 }, size: 360, color: colors.violet700, duration: 7400, delay: 0, drift: [18, 12] },
  { style: { top: "38%", right: -150 }, size: 320, color: colors.violet800, duration: 9200, delay: 1400, drift: [-16, 20] },
  { style: { bottom: -120, left: -60 }, size: 300, color: colors.violet900, duration: 10800, delay: 2600, drift: [14, -14] },
];

export function AmbientGlow({ intensity = 1 }: { intensity?: number }) {
  const active = useAmbientActive();
  return (
    // overflow hidden: as manchas passam da borda de propósito; sem o corte, no navegador do
    // celular elas alargam a página e forçam o zoom para trás (rolagem lateral indevida).
    <View pointerEvents="none" aria-hidden style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      {BLOBS.map((blob, i) => (
        <Blob key={i} {...blob} intensity={intensity} active={active} />
      ))}
    </View>
  );
}

function Blob({ style, size, color, duration, delay, drift, intensity, active }: (typeof BLOBS)[number] & { intensity: number; active: boolean }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      // Fora de foco: assenta devagar num ponto de repouso (sem salto) e para de pedir quadros.
      cancelAnimation(pulse);
      pulse.value = withTiming(0.35, { duration: 600, easing: easing.standard });
      return;
    }
    pulse.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: easing.breathe }), -1, true));
    return () => cancelAnimation(pulse);
  }, [pulse, active, delay, duration]);
  const animated = useAnimatedStyle(() => ({
    opacity: (0.32 + pulse.value * 0.28) * intensity,
    transform: [{ translateX: pulse.value * drift[0] }, { translateY: pulse.value * drift[1] }, { scale: 0.92 + pulse.value * 0.12 }],
  }));
  // Anéis do maior (mais transparente) ao menor: imitam um degradê radial.
  return (
    <Animated.View style={[{ position: "absolute", width: size, height: size }, style, animated]}>
      {[1, 0.72, 0.46].map((k, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: (size * (1 - k)) / 2,
            top: (size * (1 - k)) / 2,
            width: size * k,
            height: size * k,
            borderRadius: (size * k) / 2,
            backgroundColor: color,
            opacity: 0.16 + i * 0.1,
          }}
        />
      ))}
    </Animated.View>
  );
}
