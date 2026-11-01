import { useEffect } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";
import { colors } from "@/theme/tokens";

/**
 * Pulsos de luz roxa no fundo: manchas difusas (círculos concêntricos de baixa opacidade,
 * sem bibliotecas extras) que respiram devagar em intensidade e tamanho. Fica atrás do
 * conteúdo e não recebe toques. Com "reduzir movimento" ligado, fica parado.
 */
const BLOBS: { style: ViewStyle; size: number; color: string; duration: number; delay: number }[] = [
  { style: { top: -140, left: -110 }, size: 360, color: colors.violet700, duration: 6200, delay: 0 },
  { style: { top: "38%", right: -150 }, size: 320, color: colors.violet800, duration: 7600, delay: 1400 },
  { style: { bottom: -120, left: -60 }, size: 300, color: colors.violet900, duration: 8800, delay: 2600 },
];

export function AmbientGlow({ intensity = 1 }: { intensity?: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {BLOBS.map((blob, i) => (
        <Blob key={i} {...blob} intensity={intensity} />
      ))}
    </View>
  );
}

function Blob({ style, size, color, duration, delay, intensity }: (typeof BLOBS)[number] & { intensity: number }) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [pulse, reduceMotion, delay, duration]);
  const animated = useAnimatedStyle(() => ({
    opacity: (0.32 + pulse.value * 0.28) * intensity,
    transform: [{ scale: 0.92 + pulse.value * 0.12 }],
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
