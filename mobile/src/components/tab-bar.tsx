import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Platform, StyleSheet, View, type LayoutRectangle } from "react-native";
import type { Tabs } from "expo-router/js-tabs";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { Icon, type IconName } from "@/components/ui/icon";
import { Touchable } from "@/components/ui/primitives";
import { spring, timing } from "@/theme/motion";
import { colors, fonts, radius } from "@/theme/tokens";

/**
 * Barra de abas do ambiente. Um único indicador (a pílula roxa) desliza com mola até a aba
 * escolhida, em vez de a seleção pular de um item para outro; ícone e rótulo trocam de cor
 * em transição cruzada.
 *
 *  - bottom: celular (abaixo de 768 px), pílula atrás do ícone.
 *  - rail: tablet/janela média, coluna estreita com rótulo embaixo.
 *  - side: notebook/monitor, coluna com rótulo ao lado; a pílula ocupa a linha inteira.
 *
 * O toque segue o mesmo contrato da barra padrão (evento tabPress cancelável, tabLongPress)
 * e, na web, cada aba é um link de verdade (abrir em nova aba, foco por teclado).
 */

export type TabBarVariant = "bottom" | "rail" | "side";
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const PILL = { bottom: { width: 58, height: 30 }, rail: { width: 52, height: 32 } } as const;

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
    const target = {
      x: item.x + (item.width - pill.width) / 2,
      y: variant === "bottom" ? item.y + 6 : variant === "rail" ? item.y + 6 : item.y,
      w: pill.width,
      h: pill.height,
    };
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

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        variant === "bottom" ? [styles.bottom, { paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }] : [styles.vertical, { paddingTop: insets.top + (variant === "side" ? 24 : 16), paddingLeft: insets.left + (variant === "side" ? 12 : 0) }],
        variant === "side" ? styles.side : variant === "rail" ? styles.rail : null,
      ]}
    >
      <Animated.View pointerEvents="none" style={[styles.indicator, variant === "side" ? styles.indicatorSide : null, indicator]} />
      {state.routes.map((route, index) => {
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
      })}
    </View>
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
    on.value = withTiming(focused ? 1 : 0, timing.short);
  }, [focused, on]);

  const activeIcon = useAnimatedStyle(() => ({ opacity: on.value }));
  const idleIcon = useAnimatedStyle(() => ({ opacity: 1 - on.value }));
  const text = useAnimatedStyle(() => ({ color: interpolateColor(Math.max(on.value, hover.value * 0.45), [0, 1], [colors.muted, colors.violet300]) }));
  const surface = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(hover.value * (1 - on.value), [0, 1], ["rgba(18,12,34,0)", "rgba(18,12,34,0.8)"]) }));
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
      pressScale={0.94}
      haptic={!focused}
      style={[styles.item, variant === "bottom" ? styles.itemBottom : variant === "rail" ? styles.itemRail : styles.itemSide, surface]}
    >
      <View style={iconBox}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, idleIcon]}>
          <Icon name={icon} size={22} color={colors.muted} strokeWidth={1.6} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, activeIcon]}>
          <Icon name={icon} size={22} color={colors.violet300} strokeWidth={1.9} />
        </Animated.View>
      </View>
      <Animated.Text numberOfLines={1} style={[styles.label, variant === "side" ? styles.labelSide : null, text]}>
        {label}
      </Animated.Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.bg },
  bottom: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  vertical: { flexDirection: "column", borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.line, height: "100%" },
  rail: { width: 80 },
  side: { width: 232, paddingRight: 12, gap: 4 },
  indicator: { position: "absolute", left: 0, top: 0, borderRadius: radius.pill, backgroundColor: colors.violet950, borderWidth: 1, borderColor: colors.violet800 },
  indicatorSide: { borderRadius: radius.md },
  center: { alignItems: "center", justifyContent: "center" },
  item: { alignItems: "center", justifyContent: "center" },
  itemBottom: { flex: 1, minHeight: 56, paddingTop: 6, paddingBottom: 4, gap: 2, justifyContent: "flex-start" },
  itemRail: { minHeight: 68, paddingTop: 6, gap: 4, justifyContent: "flex-start" },
  itemSide: { flexDirection: "row", justifyContent: "flex-start", minHeight: 46, paddingHorizontal: 12, gap: 12, borderRadius: radius.md },
  iconBottom: { width: 58, height: 30 },
  iconRail: { width: 52, height: 32 },
  iconSide: { width: 24, height: 24 },
  label: { fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 16 },
  labelSide: { fontSize: 15, lineHeight: 20 },
});
