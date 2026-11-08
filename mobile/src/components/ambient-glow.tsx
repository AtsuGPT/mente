import { useEffect, useId } from "react";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";
import { easing } from "@/theme/motion";
import { colors } from "@/theme/tokens";

/**
 * Pulsos de luz roxa no fundo: manchas difusas (degradê radial em SVG, desenhado uma vez)
 * que respiram devagar em intensidade, tamanho e posição. Fica atrás
 * do conteúdo e não recebe toques. Pausa fora de foco e com "reduzir movimento".
 * Só transform e opacity animam (nada de layout nem desfoque a cada quadro).
 */
const BLOBS: { style: ViewStyle; size: number; color: string; duration: number; delay: number; drift: [number, number] }[] = [
  { style: { top: -170, left: -120 }, size: 420, color: colors.violet700, duration: 7400, delay: 0, drift: [26, 18] },
  { style: { top: "30%", right: -170 }, size: 360, color: colors.orchid, duration: 9200, delay: 1400, drift: [-22, 26] },
  { style: { bottom: -150, left: -80 }, size: 380, color: colors.violet800, duration: 10800, delay: 2600, drift: [20, -18] },
];

/** active: quem desenha decide (tela em foco, app em primeiro plano); "reduzir movimento" para sempre. */
export function AmbientGlow({ intensity = 1, active: wanted = true }: { intensity?: number; active?: boolean }) {
  const reduceMotion = useReducedMotion();
  const active = wanted && !reduceMotion;
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
    opacity: (0.3 + pulse.value * 0.3) * intensity * (color === colors.orchid ? 0.55 : 1),
    transform: [{ translateX: pulse.value * drift[0] }, { translateY: pulse.value * drift[1] }, { scale: 0.92 + pulse.value * 0.12 }],
  }));
  // Degradê radial de verdade: centro denso, borda transparente, sem anéis visíveis.
  const id = `glow${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <Animated.View style={[{ position: "absolute", width: size, height: size }, style, animated]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.62} />
            <Stop offset="0.45" stopColor={color} stopOpacity={0.3} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}
