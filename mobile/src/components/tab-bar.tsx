import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Platform, StyleSheet, View, type LayoutRectangle } from "react-native";
import type { Tabs } from "expo-router/js-tabs";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { interpolate, interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { Icon, type IconName } from "@/components/ui/icon";
import { Touchable } from "@/components/ui/primitives";
import { spring, timing } from "@/theme/motion";
import { colors, elevation, fonts, gradients, radius } from "@/theme/tokens";

/**
 * Barra de abas do ambiente, reconstruída como uma doca flutuante de vidro roxo.
 *
 * Uma única pílula em gradiente desliza com mola (interrompível: tocar em outra aba no meio
 * do caminho só muda o destino) até a aba escolhida; o ícone ativo cresce e fica branco, os
 * outros recuam para o cinza, em transição cruzada. Toque com resposta tátil.
 *
 *  - bottom: celular (abaixo de 768 px), doca no rodapé, acima da área segura.
 *  - rail: tablet/janela média, coluna estreita.
 *  - side: notebook/monitor, coluna com rótulos ao lado; a pílula ocupa a linha.
 *
 * O toque segue o contrato da barra padrão (tabPress cancelável, tabLongPress); na web cada
 * aba é um link de verdade.
 */

export type TabBarVariant = "bottom" | "rail" | "side";
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const PILL = { bottom: { width: 56, height: 36 }, rail: { width: 54, height: 36 } } as const;

export function AppTabBar({ state, descriptors, emitter, navigateToTab, insets, variant, icons }: BottomTabBarProps & { variant: TabBarVariant; icons: Record<string, IconName> }) {
  const [layouts, setLayouts] = useState<(LayoutRectangle | undefined)[]>([]);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const w = useSharedValue(0);
  const h = useSharedValue(0);
  const visible = useSharedValue(0);
  const placed = useRef<TabBarVariant | null>(null);

  useEffect(() => {
    const item = layouts[state.index];
    if (!item) return;
    const pill = variant === "side" ? { width: item.width, height: item.height } : PILL[variant];
    const target = { x: item.x + (item.width - pill.width) / 2, y: variant === "side" ? item.y : item.y + 4, w: pill.width, h: pill.height };
    // Primeira posição (ou troca de formato): sem viagem; depois, sempre com mola.
    if (placed.current !== variant) {
      placed.current = variant;
      x.value = target.x;
      y.value = target.y;
      w.value = target.w;
      h.value = target.h;
      visible.value = withTiming(1, timing.short);
      return;
    }
    x.value = withSpring(target.x, spring.selection);
    y.value = withSpring(target.y, spring.selection);
    w.value = withSpring(target.w, spring.selection);
    h.value = withSpring(target.h, spring.selection);
  }, [layouts, state.index, variant, x, y, w, h, visible]);

  const indicator = useAnimatedStyle(() => ({
    opacity: visible.value,
    width: w.value,
    height: h.value,
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  const items = state.routes.map((route, index) => {
    const options = descriptors[route.key]?.options ?? {};
    const label = typeof options.title === "string" ? options.title : route.name;
    const focused = index === state.index;
    const onPress = () => {
      const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigateToTab(route.key);
    };
    return (
      <TabItem
        key={route.key}
        label={label}
        accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
        icon={icons[route.name] ?? "home"}
        href={`/${route.name}`}
        focused={focused}
        variant={variant}
        onPress={onPress}
        onLongPress={() => emitter.emit({ type: "tabLongPress", target: route.key })}
        onLayout={(layout) =>
          setLayouts((current) => {
            const previous = current[index];
            if (previous && previous.x === layout.x && previous.y === layout.y && previous.width === layout.width && previous.height === layout.height) return current;
            const next = [...current];
            next[index] = layout;
            return next;
          })
        }
      />
    );
  });

  const pillRadius = variant === "side" ? radius.md : radius.pill;
  const pill = (
    // Sombra (brilho) por fora; degradê e reflexo recortados dentro, no mesmo raio da pílula.
    // Sem o recorte, o reflexo (mais baixo) arredonda diferente e "vaza" nos cantos de cima.
    <Animated.View pointerEvents="none" style={[styles.indicator, { borderRadius: pillRadius }, elevation.glow, indicator]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: pillRadius, overflow: "hidden" }]}>
        <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={["rgba(255,255,255,0.25)", "rgba(255,255,255,0)"]} style={styles.sheen} />
      </View>
    </Animated.View>
  );

  if (variant === "bottom") {
    return (
      <View accessibilityRole="tablist" style={[styles.dockArea, { paddingBottom: Math.max(insets.bottom, 10), paddingLeft: insets.left + 14, paddingRight: insets.right + 14 }]}>
        <View style={[styles.dockShadow, elevation.float]}>
          <LinearGradient pointerEvents="none" colors={gradients.border} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[StyleSheet.absoluteFill, styles.dockBorder]} />
          <LinearGradient pointerEvents="none" colors={["rgba(30,22,52,0.97)", "rgba(13,9,24,0.97)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.dockBody} />
          <View style={styles.dock}>
            {pill}
            {items}
          </View>
        </View>
      </View>
    );
  }

  return (
    <LinearGradient
      accessibilityRole="tablist"
      colors={["#120B24", "#07050D"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[styles.vertical, variant === "side" ? styles.side : styles.rail, { paddingTop: insets.top + (variant === "side" ? 24 : 16), paddingLeft: insets.left + (variant === "side" ? 12 : 0) }]}
    >
      {pill}
      {items}
    </LinearGradient>
  );
}

function TabItem({
  label,
  accessibilityLabel,
  icon,
  href,
  focused,
  variant,
  onPress,
  onLongPress,
  onLayout,
}: {
  label: string;
  accessibilityLabel: string;
  icon: IconName;
  href: string;
  focused: boolean;
  variant: TabBarVariant;
  onPress: () => void;
  onLongPress: () => void;
  onLayout: (layout: LayoutRectangle) => void;
}) {
  const on = useSharedValue(focused ? 1 : 0);
  const hover = useSharedValue(0);
  useEffect(() => {
    // Mola também aqui: o ícone cresce enquanto a pílula chega.
    on.value = withSpring(focused ? 1 : 0, spring.selection);
  }, [focused, on]);

  const activeIcon = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ scale: interpolate(on.value, [0, 1], [0.86, 1.08]) }] }));
  const idleIcon = useAnimatedStyle(() => ({ opacity: 1 - on.value, transform: [{ scale: interpolate(on.value, [0, 1], [1, 0.86]) }] }));
  const text = useAnimatedStyle(() => ({ color: interpolateColor(Math.max(on.value, hover.value * 0.45), [0, 1], [colors.faint, variant === "side" ? "#FFFFFF" : colors.violet200]) }));
  const surface = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(hover.value * (1 - on.value), [0, 1], ["rgba(31,23,54,0)", "rgba(31,23,54,0.75)"]) }));
  const iconBox = variant === "bottom" ? styles.iconBottom : variant === "rail" ? styles.iconRail : styles.iconSide;

  return (
    <Touchable
      {...(Platform.OS === "web" ? ({ href } as object) : {})}
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: focused }}
      // O react-native-web não converte accessibilityState em aria-selected.
      aria-selected={focused}
      onPress={(event) => {
        // Na web o item é um link de verdade: clique simples navega pelo app (sem recarregar a
        // página e perder o ambiente aberto); com Ctrl/⌘/Shift ou botão do meio, o navegador abre.
        if (Platform.OS === "web") {
          const native = event?.nativeEvent as unknown as MouseEvent | undefined;
          if (native && (native.metaKey || native.ctrlKey || native.shiftKey || native.altKey || (native.button != null && native.button !== 0))) return;
          (event as unknown as { preventDefault?: () => void })?.preventDefault?.();
        }
        onPress();
      }}
      onLongPress={onLongPress}
      onLayout={(event) => onLayout(event.nativeEvent.layout)}
      hover={hover}
      pressScale={0.92}
      haptic={!focused}
      style={[styles.item, variant === "bottom" ? styles.itemBottom : variant === "rail" ? styles.itemRail : styles.itemSide, surface]}
    >
      <View style={iconBox}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, idleIcon]}>
          <Icon name={icon} size={22} color={colors.muted} strokeWidth={1.6} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, activeIcon]}>
          <Icon name={icon} size={22} color="#FFFFFF" strokeWidth={2} />
        </Animated.View>
      </View>
      <Animated.Text numberOfLines={1} style={[styles.label, variant === "side" ? styles.labelSide : null, text]}>
        {label}
      </Animated.Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  dockArea: { paddingTop: 6, backgroundColor: "transparent" },
  dockShadow: { borderRadius: 30, backgroundColor: "#0D0918" },
  dockBorder: { borderRadius: 30 },
  dockBody: { position: "absolute", left: 1, top: 1, right: 1, bottom: 1, borderRadius: 29 },
  dock: { flexDirection: "row", margin: 1, paddingHorizontal: 6, paddingTop: 4, paddingBottom: 4 },
  vertical: { flexDirection: "column", borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.lineStrong, height: "100%" },
  rail: { width: 84 },
  side: { width: 236, paddingRight: 12, gap: 6 },
  indicator: { position: "absolute", left: 0, top: 0, backgroundColor: colors.violet600 },
  sheen: { position: "absolute", left: 0, right: 0, top: 0, height: "55%" },
  center: { alignItems: "center", justifyContent: "center" },
  item: { alignItems: "center", justifyContent: "center" },
  itemBottom: { flex: 1, minHeight: 60, gap: 1, justifyContent: "flex-start", borderRadius: radius.pill },
  itemRail: { minHeight: 70, gap: 4, justifyContent: "flex-start" },
  itemSide: { flexDirection: "row", justifyContent: "flex-start", minHeight: 48, paddingHorizontal: 14, gap: 12, borderRadius: radius.md },
  iconBottom: { width: 56, height: 40 },
  iconRail: { width: 54, height: 44 },
  iconSide: { width: 24, height: 24 },
  label: { fontFamily: fonts.sansMedium, fontSize: 11, lineHeight: 14, letterSpacing: 0.2 },
  labelSide: { fontSize: 15, lineHeight: 20 },
});
