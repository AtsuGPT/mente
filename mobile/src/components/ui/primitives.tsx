import { forwardRef, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
  type WithTimingConfig,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { colors, elevation, fonts, gradients, radius, space, tint, type } from "@/theme/tokens";
import { Surface } from "./surface";
import { duration, easing, enter, spring, timing } from "@/theme/motion";
import { Icon, type IconName } from "./icon";
import { useTypeScale } from "@/theme/type-scale";

/* ------------------------------- Texto -------------------------------- */

type Variant = keyof typeof type;

export function AppText({ variant = "ui", color, style, ...props }: TextProps & { variant?: Variant; color?: string }) {
  const scale = useTypeScale();
  const base = [type[variant], { color: color ?? colors.text }, style];
  // Na maioria dos celulares a escala é 1 e o estilo passa direto, sem custo extra.
  if (scale === 1) return <Text {...props} style={base} />;
  const flat = StyleSheet.flatten(base) as TextStyle;
  const scaled: TextStyle = {
    ...(typeof flat.fontSize === "number" ? { fontSize: Math.round(flat.fontSize * scale * 2) / 2 } : null),
    ...(typeof flat.lineHeight === "number" ? { lineHeight: Math.round(flat.lineHeight * scale) } : null),
  };
  return <Text {...props} style={[flat, scaled]} />;
}

/* ------------------------- Toque com resposta -------------------------- */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Contorno de foco ao navegar pelo teclado (web): o react-native-web não desenha um. */
const focusRing: ViewStyle | null =
  Platform.OS === "web" ? ({ outlineStyle: "solid", outlineWidth: 2, outlineColor: colors.violet400, outlineOffset: 2 } as ViewStyle) : null;

type TouchableProps = Omit<PressableProps, "style"> & {
  /** Aceita estilos animados (useAnimatedStyle), além dos comuns. */
  style?: ComponentProps<typeof AnimatedPressable>["style"];
  haptic?: boolean;
  /** Escala ao pressionar (1 = sem escala). Botões grandes afundam menos que ícones. */
  pressScale?: number;
  /** Progresso do toque (0–1, com mola) para quem quiser derivar cor ou brilho. */
  press?: SharedValue<number>;
  /** Mouse por cima (só web), 0–1 com transição curta. */
  hover?: SharedValue<number>;
};

/**
 * Pressable com resposta física: afunda com mola firme ao tocar e volta com um assentar
 * mínimo ao soltar (sem oscilação visível). Na web, o foco por teclado ganha contorno.
 */
export function Touchable({ style, onPressIn, onPressOut, onHoverIn, onHoverOut, onFocus, onBlur, haptic, onPress, pressScale = 0.97, press, hover, ...props }: TouchableProps) {
  const internal = useSharedValue(0);
  const progress = press ?? internal;
  const animated = useAnimatedStyle(() => (pressScale === 1 ? {} : { transform: [{ scale: interpolate(progress.value, [0, 1], [1, pressScale]) }] }));
  const [focused, setFocused] = useState(false);
  return (
    <AnimatedPressable
      {...props}
      // Sem papel explícito, algo tocável é anunciado como botão pelos leitores de tela.
      accessibilityRole={props.accessibilityRole ?? (props.role || !onPress ? undefined : "button")}
      onFocus={(event) => {
        // Só o foco por teclado ganha contorno (o clique do mouse também foca na web).
        if (Platform.OS === "web") setFocused(isKeyboardFocus(event));
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      onHoverIn={(event) => {
        if (hover) hover.value = withTiming(1, timing.micro);
        onHoverIn?.(event);
      }}
      onHoverOut={(event) => {
        if (hover) hover.value = withTiming(0, timing.short);
        onHoverOut?.(event);
      }}
      onPress={(event) => {
        if (haptic) void Haptics.selectionAsync().catch(() => undefined);
        onPress?.(event);
      }}
      onPressIn={(event) => {
        progress.value = withSpring(1, spring.press);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        progress.value = withSpring(0, spring.release);
        onPressOut?.(event);
      }}
      style={[style, focused && focusRing, animated]}
    />
  );
}

function isKeyboardFocus(event: unknown): boolean {
  const target = (event as { target?: { matches?: (selector: string) => boolean } } | null)?.target;
  try {
    return target?.matches?.(":focus-visible") ?? true;
  } catch {
    return true;
  }
}

/** 0 ↔ 1 seguindo um booleano, com a curva padrão (seleção, foco, erro, desabilitado). */
function useToggle(on: boolean, config: WithTimingConfig = timing.short) {
  const value = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    value.value = withTiming(on ? 1 : 0, config);
  }, [on, value, config]);
  return value;
}

/* ------------------------------- Botão -------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

/** Cores de repouso, mouse por cima e pressionado. Transparentes como rgba para interpolar sem cinza. */
const buttonPalette: Record<ButtonVariant, { bg: string; hover: string; pressed: string; fg: string; border: string }> = {
  // O primário pinta um gradiente por baixo; aqui só a camada de escurecer ao tocar.
  primary: { bg: "rgba(0,0,0,0)", hover: "rgba(255,255,255,0.06)", pressed: "rgba(0,0,0,0.28)", fg: "#FFFFFF", border: "rgba(199,183,250,0.32)" },
  secondary: { bg: "rgba(24,22,30,0.9)", hover: "rgba(32,30,40,0.95)", pressed: "rgba(40,37,50,1)", fg: colors.text, border: colors.lineStrong },
  ghost: { bg: "rgba(24,22,30,0)", hover: "rgba(24,22,30,0.8)", pressed: "rgba(132,97,240,0.14)", fg: colors.violet300, border: "rgba(0,0,0,0)" },
  danger: { bg: colors.dangerSoft, hover: "#36141A", pressed: "#42171D", fg: colors.danger, border: "#4A1C22" },
};

export function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  style,
  compact,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const palette = buttonPalette[variant];
  const inactive = disabled || loading;
  const press = useSharedValue(0);
  const hover = useSharedValue(0);
  const off = useToggle(!!disabled);
  const busy = useToggle(!!loading, timing.micro);
  const surface = useAnimatedStyle(() => ({
    backgroundColor: variant === "primary" ? "transparent" : interpolateColor(press.value, [0, 1], [interpolateColor(hover.value, [0, 1], [palette.bg, palette.hover]), palette.pressed]),
    opacity: interpolate(off.value, [0, 1], [1, 0.42]),
  }));
  const shade = useAnimatedStyle(() => ({ opacity: press.value * 0.28 + hover.value * 0.04 }));
  // O rótulo some e o indicador aparece no mesmo lugar: a largura do botão não muda.
  const content = useAnimatedStyle(() => ({ opacity: 1 - busy.value }));
  const spinner = useAnimatedStyle(() => ({ opacity: busy.value }));
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      haptic
      press={press}
      hover={hover}
      pressScale={0.98}
      style={[styles.button, compact && styles.buttonCompact, { borderColor: palette.border }, variant === "primary" && elevation.glow, surface, style]}
    >
      {variant === "primary" ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}>
          <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={["rgba(255,255,255,0.12)", "rgba(255,255,255,0)"]} style={styles.sheen} />
        </View>
      ) : null}
      <Animated.View style={[styles.buttonContent, content]}>
        {icon ? <Icon name={icon} size={18} color={palette.fg} /> : null}
        <Text style={[type.uiMedium, { color: palette.fg }]}>{label}</Text>
      </Animated.View>
      {variant === "primary" ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, styles.shade, shade]} /> : null}
      {loading ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, spinner]}>
          <ActivityIndicator color={palette.fg} size="small" />
        </Animated.View>
      ) : null}
    </Touchable>
  );
}

export function IconButton({ name, onPress, label, color = colors.text, active }: { name: IconName; onPress: () => void; label: string; color?: string; active?: boolean }) {
  const press = useSharedValue(0);
  const hover = useSharedValue(0);
  const on = useToggle(!!active);
  const surface = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [interpolateColor(Math.max(hover.value * 0.6, press.value), [0, 1], ["rgba(20,19,25,0.86)", "rgba(36,33,44,0.95)"]), tint.selected]),
    borderColor: interpolateColor(on.value, [0, 1], ["rgba(255,255,255,0.08)", tint.selectedBorder]),
  }));
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      hitSlop={4}
      onPress={onPress}
      press={press}
      hover={hover}
      pressScale={0.9}
      style={[styles.iconButton, surface]}
    >
      <Icon name={name} size={20} color={active ? colors.violet300 : color} />
    </Touchable>
  );
}

/* ---------------------------- Campo de texto ---------------------------- */

export const TextField = forwardRef<TextInputInstance, TextInputProps & { label?: string; error?: string; hint?: string; containerStyle?: StyleProp<ViewStyle> }>(
  function TextField({ label, error, hint, containerStyle, style, onFocus, onBlur, ...props }, ref) {
    const focus = useSharedValue(0);
    const invalid = useToggle(!!error);
    const field = useAnimatedStyle(() => ({
      borderColor: interpolateColor(invalid.value, [0, 1], [interpolateColor(focus.value, [0, 1], [colors.lineStrong, colors.violet500]), colors.danger]),
      backgroundColor: interpolateColor(focus.value, [0, 1], ["rgba(14,13,18,0.9)", "rgba(18,16,24,0.95)"]),
      shadowOpacity: focus.value * 0.3,
    }));
    const labelColor = useAnimatedStyle(() => ({ color: interpolateColor(focus.value, [0, 1], [colors.muted, colors.violet300]) }));
    return (
      <View style={containerStyle}>
        {label ? <Animated.Text style={[type.label, { marginBottom: space.sm }, labelColor]}>{label}</Animated.Text> : null}
        <Animated.View style={[styles.field, field]}>
          <TextInput
            ref={ref}
            placeholderTextColor={colors.faint}
            selectionColor={colors.violet400}
            onFocus={(event) => {
              focus.value = withTiming(1, timing.micro);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              focus.value = withTiming(0, timing.short);
              onBlur?.(event);
            }}
            accessibilityLabel={label}
            {...props}
            style={[styles.input, style as StyleProp<TextStyle>]}
          />
        </Animated.View>
        {error ? (
          <Animated.View entering={enter.fade} accessibilityLiveRegion="polite">
            <AppText variant="small" color={colors.danger} style={{ marginTop: space.xs }}>{error}</AppText>
          </Animated.View>
        ) : null}
        {!error && hint ? <AppText variant="small" color={colors.faint} style={{ marginTop: space.xs }}>{hint}</AppText> : null}
      </View>
    );
  },
);

/* -------------------------------- Chip --------------------------------- */

export function Chip({ label, selected, onPress, dot, count }: { label: string; selected?: boolean; onPress?: () => void; dot?: string; count?: number }) {
  const on = useToggle(!!selected);
  const hover = useSharedValue(0);
  const surface = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [interpolateColor(hover.value, [0, 1], ["rgba(14,13,18,0.9)", "rgba(28,26,34,0.95)"]), tint.selected]),
    borderColor: interpolateColor(on.value, [0, 1], [interpolateColor(hover.value, [0, 1], [colors.line, colors.lineStrong]), tint.selectedBorder]),
  }));
  const text = useAnimatedStyle(() => ({ color: interpolateColor(on.value, [0, 1], [colors.muted, colors.violet200]) }));
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      hover={hover}
      pressScale={0.95}
      style={[styles.chip, surface]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
      <Animated.Text style={[type.small, { fontFamily: fonts.sansMedium }, text]}>{label}</Animated.Text>
      {count !== undefined ? <Text style={[type.small, { color: colors.faint }]}>{count}</Text> : null}
    </Touchable>
  );
}

/* ------------------------------ Superfícies ----------------------------- */

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Surface elevated contentStyle={[styles.card, style]}>
      {children}
    </Surface>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }, style]} />;
}

/** Rótulo de seção: pequeno, em caixa alta, com um filete roxo à esquerda. */
export function SectionLabel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: space.sm }, style]}>
      <LinearGradient colors={[colors.violet400, "rgba(132,97,240,0)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: 18, height: 2, borderRadius: 1 }} />
      <AppText variant="label" color={colors.muted}>{children}</AppText>
    </View>
  );
}

/**
 * Bloco de esqueleto: a forma do conteúdo que vai chegar, respirando devagar. Evita o
 * salto de um indicador centralizado para a lista. Parado com "reduzir movimento".
 */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 900, easing: easing.breathe }), withTiming(0, { duration: 900, easing: easing.breathe })), -1);
    return () => cancelAnimation(pulse);
  }, [pulse, reduceMotion]);
  const animated = useAnimatedStyle(() => ({ opacity: 0.5 + pulse.value * 0.35 }));
  return <Animated.View aria-hidden style={[styles.skeleton, style, animated]} />;
}

/* ---------------------- Estados: carregando/erro/vazio ---------------------- */

/**
 * Carregando, erro ou vazio. Entra com esmaecimento; o indicador de carregamento só
 * aparece depois de um instante, para respostas rápidas não piscarem na tela.
 */
/** Enquanto os dados chegam: cartões com a forma do conteúdo (título e linhas), com os blocos de Skeleton. */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <Animated.View entering={enter.fade} style={styles.skeletonList} accessibilityLabel="Carregando" accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.skeletonCard}>
          <Skeleton style={{ width: "55%", height: 14 }} />
          <Skeleton style={{ width: "92%", height: 10 }} />
          <Skeleton style={{ width: i % 2 ? "68%" : "80%", height: 10 }} />
        </View>
      ))}
    </Animated.View>
  );
}

export function StateView({ loading, error, empty, onRetry }: { loading?: boolean; error?: string | null; empty?: string; onRetry?: () => void }) {
  // Carregando: a forma do conteúdo, com brilho suave, no lugar do giro (a tela parece pronta antes dos dados).
  if (loading) return <SkeletonList />;
  if (error) {
    return (
      <Animated.View entering={enter.rise} style={styles.state} accessibilityLiveRegion="polite">
        <AppText variant="heading" style={{ textAlign: "center" }}>Algo não saiu como esperado</AppText>
        <AppText color={colors.muted} style={{ textAlign: "center", marginTop: space.sm }}>{error}</AppText>
        {onRetry ? <Button label="Tentar de novo" variant="secondary" onPress={onRetry} style={{ marginTop: space.lg }} compact /> : null}
      </Animated.View>
    );
  }
  if (empty) {
    return (
      <Animated.View entering={enter.rise} style={styles.state}>
        <AppText variant="body" color={colors.muted} style={{ textAlign: "center", fontFamily: fonts.serifItalic }}>{empty}</AppText>
      </Animated.View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonContent: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
  buttonCompact: { minHeight: 44, paddingHorizontal: space.lg },
  center: { alignItems: "center", justifyContent: "center" },
  clip: { borderRadius: radius.pill, overflow: "hidden" },
  sheen: { position: "absolute", top: 0, left: 0, right: 0, height: "55%" },
  shade: { backgroundColor: "#000000" },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  field: {
    borderWidth: 1,
    borderRadius: radius.lg,
    shadowColor: colors.violet500,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  input: {
    ...type.ui,
    color: colors.text,
    paddingHorizontal: space.lg,
    paddingVertical: 14,
    minHeight: 50,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs + 2,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  card: {
    padding: space.lg,
  },
  skeleton: { backgroundColor: colors.surfaceRaised, borderRadius: radius.sm },
  state: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xxl, minHeight: 240 },
  skeletonList: { padding: space.lg, gap: space.md, width: "100%" },
  skeletonCard: { padding: space.md, gap: space.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.glass },
});
