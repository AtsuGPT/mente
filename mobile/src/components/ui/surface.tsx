import { useId, type ReactNode } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { enter } from "@/theme/motion";
import { colors, elevation, gradients, radius as radii } from "@/theme/tokens";

/**
 * Superfície em camadas do novo visual: borda em gradiente (brilho no canto superior que se
 * apaga para baixo) envolvendo um corpo também em gradiente (mais claro no alto, como luz
 * vinda de cima). style: posição e tamanho; contentStyle: espaçamento e layout do conteúdo.
 */
export function Surface({
  children,
  style,
  contentStyle,
  radius = radii.lg,
  raised = false,
  active = false,
  elevated = false,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  radius?: number;
  raised?: boolean;
  active?: boolean;
  elevated?: boolean;
}) {
  // A sombra mora numa View comum por fora: no iOS o LinearGradient sempre recorta o
  // próprio conteúdo e, junto, a própria sombra.
  return (
    <View style={[{ borderRadius: radius }, elevated && [elevation.card, { backgroundColor: colors.surface }], style]}>
      <LinearGradient
        colors={active ? gradients.borderActive : gradients.border}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={{ flexGrow: 1, borderRadius: radius, padding: StyleSheet.hairlineWidth * 2 }}
      >
        <LinearGradient
          colors={raised ? gradients.surfaceRaised : gradients.surface}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[{ flexGrow: 1, borderRadius: radius - 1, overflow: "hidden" }, contentStyle]}
        >
          {children}
        </LinearGradient>
      </LinearGradient>
    </View>
  );
}

/** Luz circular difusa (degradê radial em SVG): centro na cor, borda transparente, sem aresta. */
export function RadialGlow({ size, color, opacity = 0.6, style }: { size: number; color: string; opacity?: number; style?: StyleProp<ViewStyle> }) {
  const id = `rg${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <View pointerEvents="none" aria-hidden style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="0.5" stopColor={color} stopOpacity={opacity * 0.45} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * Fundo das telas: preto. Sem aurora nem luz permanente; o brilho fica para o que ele
 * significa (a Kally, a seleção). Continua sendo um componente para as telas que o desenham.
 */
export function ScreenBackdrop() {
  return <View pointerEvents="none" aria-hidden style={[StyleSheet.absoluteFill, styles.backdrop]} />;
}

type NavigationLike = { isFocused: () => boolean; addListener: (event: "focus" | "blur", callback: () => void) => () => void };

/**
 * Moldura de cada tela das pilhas (screenLayout): fundo preto opaco por baixo do conteúdo,
 * para que as transições nativas não mostrem a tela de baixo. Na web, a página ainda entra com
 * um esmaecimento curto.
 */
export function ScreenFrame({ children }: { navigation: NavigationLike; children: ReactNode }) {
  if (Platform.OS !== "web") return <View style={styles.frame}>{children}</View>;
  return (
    <Animated.View entering={enter.fade} style={styles.frame}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.bg },
  backdrop: { backgroundColor: colors.bg },
});
