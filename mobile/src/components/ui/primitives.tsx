import { forwardRef, type ReactNode } from "react";
import {
  ActivityIndicator,
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
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { accent, colors, fonts, motion, radius, space, type } from "@/theme/tokens";
import { Icon, type IconName } from "./icon";

/* ------------------------------- Texto -------------------------------- */

type Variant = keyof typeof type;

export function AppText({ variant = "ui", color, style, ...props }: TextProps & { variant?: Variant; color?: string }) {
  return <Text {...props} style={[type[variant], { color: color ?? colors.text }, style]} />;
}

/* ------------------------- Toque com resposta -------------------------- */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable com leve redução de escala ao tocar (animação discreta). */
export function Touchable({ style, onPressIn, onPressOut, haptic, onPress, ...props }: PressableProps & { style?: StyleProp<ViewStyle>; haptic?: boolean }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...props}
      onPress={(event) => {
        if (haptic) void Haptics.selectionAsync().catch(() => undefined);
        onPress?.(event);
      }}
      onPressIn={(event) => {
        scale.value = withTiming(0.97, { duration: motion.fast });
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withTiming(1, { duration: motion.fast });
        onPressOut?.(event);
      }}
      style={[style, animated]}
    />
  );
}

/* ------------------------------- Botão -------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

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
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      haptic
      style={[
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.45 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={palette.fg} /> : null}
          <Text style={[type.uiMedium, { color: palette.fg }]}>{label}</Text>
        </>
      )}
    </Touchable>
  );
}

const buttonPalette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: accent.primary, fg: "#FFFFFF", border: colors.violet500 },
  secondary: { bg: colors.surfaceRaised, fg: colors.text, border: colors.lineStrong },
  ghost: { bg: "transparent", fg: colors.violet300, border: "transparent" },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: "#5A2228" },
};

export function IconButton({ name, onPress, label, color = colors.text, active }: { name: IconName; onPress: () => void; label: string; color?: string; active?: boolean }) {
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={[styles.iconButton, active && { backgroundColor: colors.violet900, borderColor: colors.violet700 }]}
    >
      <Icon name={name} size={20} color={active ? colors.violet300 : color} />
    </Touchable>
  );
}

/* ---------------------------- Campo de texto ---------------------------- */

export const TextField = forwardRef<TextInputInstance, TextInputProps & { label?: string; error?: string; hint?: string; containerStyle?: StyleProp<ViewStyle> }>(
  function TextField({ label, error, hint, containerStyle, style, onFocus, onBlur, ...props }, ref) {
    const focus = useSharedValue(0);
    const border = useAnimatedStyle(() => ({
      borderColor: error ? colors.danger : focus.value ? colors.violet500 : colors.lineStrong,
    }));
    return (
      <View style={containerStyle}>
        {label ? <AppText variant="label" color={colors.muted} style={{ marginBottom: space.sm }}>{label}</AppText> : null}
        <Animated.View style={[styles.field, border]}>
          <TextInput
            ref={ref}
            placeholderTextColor={colors.faint}
            selectionColor={colors.violet400}
            onFocus={(event) => {
              focus.value = withTiming(1, { duration: motion.fast });
              onFocus?.(event);
            }}
            onBlur={(event) => {
              focus.value = withTiming(0, { duration: motion.fast });
              onBlur?.(event);
            }}
            {...props}
            style={[styles.input, style as StyleProp<TextStyle>]}
          />
        </Animated.View>
        {error ? <AppText variant="small" color={colors.danger} style={{ marginTop: space.xs }}>{error}</AppText> : null}
        {!error && hint ? <AppText variant="small" color={colors.faint} style={{ marginTop: space.xs }}>{hint}</AppText> : null}
      </View>
    );
  },
);

/* -------------------------------- Chip --------------------------------- */

export function Chip({ label, selected, onPress, dot, count }: { label: string; selected?: boolean; onPress?: () => void; dot?: string; count?: number }) {
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
      <Text style={[type.small, { color: selected ? colors.violet200 : colors.muted, fontFamily: fonts.sansMedium }]}>{label}</Text>
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

/* ---------------------- Estados: carregando/erro/vazio ---------------------- */

export function StateView({ loading, error, empty, onRetry }: { loading?: boolean; error?: string | null; empty?: string; onRetry?: () => void }) {
  if (loading) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={colors.violet400} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.state}>
        <AppText variant="heading" style={{ textAlign: "center" }}>Algo não saiu como esperado</AppText>
        <AppText color={colors.muted} style={{ textAlign: "center", marginTop: space.sm }}>{error}</AppText>
        {onRetry ? <Button label="Tentar de novo" variant="secondary" onPress={onRetry} style={{ marginTop: space.lg }} compact /> : null}
      </View>
    );
  }
  if (empty) {
    return (
      <View style={styles.state}>
        <AppText variant="body" color={colors.muted} style={{ textAlign: "center", fontFamily: fonts.serifItalic }}>{empty}</AppText>
      </View>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  buttonCompact: { minHeight: 40, paddingHorizontal: space.lg },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  field: {
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
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
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipSelected: { borderColor: colors.violet600, backgroundColor: colors.violet950 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
  },
  state: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xxl, minHeight: 240 },
});
