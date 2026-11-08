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
import { accent, colors, fonts, radius, space, type } from "@/theme/tokens";
import { duration, easing, enter, spring, timing } from "@/theme/motion";
import { Icon, type IconName } from "./icon";

/* ------------------------------- Texto -------------------------------- */

type Variant = keyof typeof type;

export function AppText({ variant = "ui", color, style, ...props }: TextProps & { variant?: Variant; color?: string }) {
  return <Text {...props} style={[type[variant], { color: color ?? colors.text }, style]} />;
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
  primary: { bg: accent.primary, hover: "#6441BC", pressed: accent.primaryPressed, fg: "#FFFFFF", border: colors.violet500 },
  secondary: { bg: colors.surfaceRaised, hover: "#181326", pressed: colors.surfacePressed, fg: colors.text, border: colors.lineStrong },
  ghost: { bg: "rgba(18,12,34,0)", hover: "rgba(18,12,34,0.7)", pressed: colors.violet950, fg: colors.violet300, border: "rgba(0,0,0,0)" },
  danger: { bg: colors.dangerSoft, hover: "#431A1F", pressed: "#4D1D23", fg: colors.danger, border: "#5A2228" },
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
    backgroundColor: interpolateColor(press.value, [0, 1], [interpolateColor(hover.value, [0, 1], [palette.bg, palette.hover]), palette.pressed]),
    opacity: interpolate(off.value, [0, 1], [1, 0.45]),
  }));
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
      style={[styles.button, compact && styles.buttonCompact, { borderColor: palette.border }, surface, style]}
    >
      <Animated.View style={[styles.buttonContent, content]}>
        {icon ? <Icon name={icon} size={18} color={palette.fg} /> : null}
        <Text style={[type.uiMedium, { color: palette.fg }]}>{label}</Text>
      </Animated.View>
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
    backgroundColor: interpolateColor(Math.max(on.value, hover.value * 0.5, press.value * 0.7), [0, 1], ["rgba(29,19,54,0)", colors.violet900]),
    borderColor: interpolateColor(on.value, [0, 1], ["rgba(67,42,128,0)", colors.violet700]),
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
      backgroundColor: interpolateColor(focus.value, [0, 1], [colors.surface, "#100D19"]),
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
    backgroundColor: interpolateColor(on.value, [0, 1], [interpolateColor(hover.value, [0, 1], [colors.surface, colors.surfaceRaised]), colors.violet950]),
    borderColor: interpolateColor(on.value, [0, 1], [interpolateColor(hover.value, [0, 1], [colors.line, colors.lineStrong]), colors.violet600]),
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
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }, style]} />;
}

/** Rótulo de seção: pequeno, em caixa alta, com um filete roxo à esquerda. */
export function SectionLabel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: space.sm }, style]}>
      <View style={{ width: 14, height: 1.5, backgroundColor: colors.violet500 }} />
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
export function StateView({ loading, error, empty, onRetry }: { loading?: boolean; error?: string | null; empty?: string; onRetry?: () => void }) {
  if (loading) {
    return (
      <Animated.View entering={enter.fade.delay(duration.micro)} style={styles.state} accessibilityLabel="Carregando" accessibilityRole="progressbar">
        <ActivityIndicator color={colors.violet400} />
      </Animated.View>
    );
  }
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
    minHeight: 50,
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonContent: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
  buttonCompact: { minHeight: 44, paddingHorizontal: space.lg },
  center: { alignItems: "center", justifyContent: "center" },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  field: {
    borderWidth: 1,
    borderRadius: radius.md,
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
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
  },
  skeleton: { backgroundColor: colors.surfaceRaised, borderRadius: radius.sm },
  state: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xxl, minHeight: 240 },
});
