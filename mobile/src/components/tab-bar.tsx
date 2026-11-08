import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { Platform, StyleSheet, View, type LayoutRectangle } from "react-native";
import type { Tabs } from "expo-router/js-tabs";
import Animated, { interpolate, interpolateColor, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { Icon, type IconName } from "@/components/ui/icon";
import { Touchable } from "@/components/ui/primitives";
import { spring, timing } from "@/theme/motion";
import { colors, fonts, radius, tint } from "@/theme/tokens";

/**
 * Barra de abas do ambiente: preta, de ponta a ponta, como a de um app nativo.
 *
 * Uma única pílula roxa translúcida desliza com mola (interrompível: tocar em outra aba no meio
 * do caminho só muda o destino) até a aba escolhida; o ícone ativo ganha o lilás e os outros
 * ficam em cinza, em transição cruzada. Toque com resposta tátil.
 *
 *  - bottom: celular (abaixo de 768 px), barra no rodapé, acima da área segura.
 *  - rail: tablet/janela média, coluna estreita.
 *  - side: notebook/monitor, coluna com rótulos ao lado; a pílula ocupa a linha.
 *
 * O toque segue o contrato da barra padrão (tabPress cancelável, tabLongPress); na web cada
 * aba é um link de verdade.
 */

export type TabBarVariant = "bottom" | "rail" | "side";
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const PILL = { bottom: { width: 58, height: 32 }, rail: { width: 54, height: 36 } } as const;
/** Distância do topo do item até a pílula (centrada no ícone). */
const PILL_TOP: Record<TabBarVariant, number> = { bottom: 7, rail: 4, side: 0 };

export function AppTabBar({ state, descriptors, emitter, navigateToTab, insets, variant, icons }: BottomTabBarProps & { variant: TabBarVariant; icons: Record<string, IconName> }) {
  const [layouts, setLayouts] = useState<(LayoutRectangle | undefined)[]>([]);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const w = useSharedValue(0);
  const h = useSharedValue(0);
  const visible = useSharedValue(0);
  const placed = useRef<TabBarVariant | null>(null);
  // Aba ativa para a animação (muda no toque, antes da navegação) e o último destino da pílula.
  const active = useSharedValue(state.index);
  const aimed = useRef("");

  const aim = useCallback((index: number) => {
    active.value = index;
    const item = layouts[index];
    if (!item) return;
    const pill = variant === "side" ? { width: item.width, height: item.height } : PILL[variant];
    const target = { x: item.x + (item.width - pill.width) / 2, y: item.y + PILL_TOP[variant], w: pill.width, h: pill.height };
    // Mesmo destino (o toque já mirou e agora o estado confirma): não reinicia a mola.
    const key = `${variant}|${target.x}|${target.y}|${target.w}|${target.h}`;
    if (aimed.current === key) return;
    aimed.current = key;
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
  }, [layouts, variant, active, x, y, w, h, visible]);

  // Navegação por outros caminhos (voltar, links): o estado manda.
  useEffect(() => aim(state.index), [aim, state.index]);

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
      if (!focused && !event.defaultPrevented) {
        aim(index);
        navigateToTab(route.key);
      }
    };
    return (
      <TabItem
        key={route.key}
        label={label}
        accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
        icon={icons[route.name] ?? "home"}
        href={`/${route.name}`}
        focused={focused}
        index={index}
        active={active}
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
  // Indicador discreto: roxo translúcido com um fio mais claro, sem degradê nem brilho.
  const pill = <Animated.View pointerEvents="none" style={[styles.indicator, { borderRadius: pillRadius }, indicator]} />;

  if (variant === "bottom") {
    return (
      <View accessibilityRole="tablist" style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8), paddingLeft: insets.left + 4, paddingRight: insets.right + 4 }]}>
        {pill}
        {items}
      </View>
    );
  }

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.vertical, variant === "side" ? styles.side : styles.rail, { paddingTop: insets.top + (variant === "side" ? 24 : 16), paddingLeft: insets.left + (variant === "side" ? 12 : 0) }]}
    >
      {pill}
      {items}
    </View>
  );
}

function TabItem({
  label,
  accessibilityLabel,
  icon,
  href,
  focused,
  index,
  active,
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
  index: number;
  active: SharedValue<number>;
  variant: TabBarVariant;
  onPress: () => void;
  onLongPress: () => void;
  onLayout: (layout: LayoutRectangle) => void;
}) {
  const on = useSharedValue(focused ? 1 : 0);
  const hover = useSharedValue(0);
  // Segue a aba ativa na UI thread: o ícone muda junto com a pílula, já no toque.
  useAnimatedReaction(
    () => active.value === index,
    (isOn, was) => {
      if (was !== null && isOn !== was) on.value = withSpring(isOn ? 1 : 0, spring.selection);
    },
  );

  // Troca cruzada com escala curta (sem "pulo" do ícone).
  const activeIcon = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ scale: interpolate(on.value, [0, 1], [0.92, 1]) }] }));
  const idleIcon = useAnimatedStyle(() => ({ opacity: 1 - on.value, transform: [{ scale: interpolate(on.value, [0, 1], [1, 0.92]) }] }));
  const text = useAnimatedStyle(() => ({ color: interpolateColor(Math.max(on.value, hover.value * 0.45), [0, 1], [colors.faint, variant === "side" ? colors.text : colors.violet200]) }));
  const surface = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(hover.value * (1 - on.value), [0, 1], ["rgba(255,255,255,0)", "rgba(255,255,255,0.05)"]) }));
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
      pressScale={0.95}
      haptic={!focused}
      style={[styles.item, variant === "bottom" ? styles.itemBottom : variant === "rail" ? styles.itemRail : styles.itemSide, surface]}
    >
      <View style={iconBox}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, idleIcon]}>
          <Icon name={icon} size={22} color={colors.faint} strokeWidth={1.5} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, activeIcon]}>
          <Icon name={icon} size={22} color={colors.violet300} strokeWidth={1.8} />
        </Animated.View>
      </View>
      <Animated.Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} maxFontSizeMultiplier={1.3} style={[styles.label, variant === "side" ? styles.labelSide : null, text]}>
        {label}
      </Animated.Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  // Barra nativa: preta, de ponta a ponta, com um fio fino em cima.
  bar: { flexDirection: "row", paddingTop: 0, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineStrong },
  vertical: { flexDirection: "column", borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.lineStrong, height: "100%", backgroundColor: colors.bg },
  rail: { width: 84 },
  side: { width: 236, paddingRight: 12, gap: 6 },
  indicator: { position: "absolute", left: 0, top: 0, backgroundColor: tint.selected, borderWidth: StyleSheet.hairlineWidth, borderColor: tint.selectedBorder },
  center: { alignItems: "center", justifyContent: "center" },
  item: { alignItems: "center", justifyContent: "center" },
  itemBottom: { flex: 1, minHeight: 58, paddingTop: 7, gap: 3, justifyContent: "flex-start", borderRadius: radius.md },
  itemRail: { minHeight: 70, gap: 4, justifyContent: "flex-start" },
  itemSide: { flexDirection: "row", justifyContent: "flex-start", minHeight: 48, paddingHorizontal: 14, gap: 12, borderRadius: radius.md },
  iconBottom: { width: 58, height: 32 },
  iconRail: { width: 54, height: 44 },
  iconSide: { width: 24, height: 24 },
  label: { fontFamily: fonts.sansMedium, fontSize: 10.5, lineHeight: 13, letterSpacing: 0.1 },
  labelSide: { fontSize: 15, lineHeight: 20 },
});
