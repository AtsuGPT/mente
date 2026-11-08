import { useEffect, useId, useState, type ReactNode } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { AmbientGlow } from "@/components/ambient-glow";
import { useAppActive } from "@/lib/use-ambient";
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

/** Fundo das telas: gradiente vertical, aurora roxa que respira devagar e vinheta embaixo. */
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

export function ScreenBackdrop({ active = true, intensity = 1 }: { active?: boolean; intensity?: number }) {
  return (
    <View pointerEvents="none" aria-hidden style={StyleSheet.absoluteFill}>
      <LinearGradient colors={gradients.screen} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      <AmbientGlow intensity={intensity} active={active} />
      <LinearGradient colors={["rgba(5,3,9,0)", "rgba(5,3,9,0.72)"]} style={styles.vignette} />
    </View>
  );
}

type NavigationLike = { isFocused: () => boolean; addListener: (event: "focus" | "blur", callback: () => void) => () => void };

/**
 * Moldura de cada tela das pilhas (screenLayout): fundo opaco do novo visual por baixo do
 * conteúdo, para que nenhuma tela fique com o fundo antigo. A aurora só anima com a tela em
 * foco e o app em primeiro plano. Na web, a página ainda entra com um esmaecimento curto.
 */
export function ScreenFrame({ navigation, children }: { navigation: NavigationLike; children: ReactNode }) {
  // Uma tela que acaba de montar quase sempre está em foco; o valor real é lido no efeito,
  // porque isFocused() durante a renderização pode vir desatualizado (e o React Navigation avisa).
  const [focused, setFocused] = useState(true);
  const appActive = useAppActive();
  useEffect(() => {
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener("focus", () => setFocused(true));
    const offBlur = navigation.addListener("blur", () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  const body = (
    <View style={styles.frame}>
      <ScreenBackdrop active={focused && appActive} />
      {children}
    </View>
  );
  if (Platform.OS !== "web") return body;
  return (
    <Animated.View entering={enter.fade} style={styles.frame}>
      {body}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: gradients.screen[1] },
  vignette: { position: "absolute", left: 0, right: 0, bottom: 0, height: "38%" },
});
