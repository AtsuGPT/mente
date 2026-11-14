import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { BackHandler, FlatList, Platform, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { router } from "expo-router";
import { useCurrentEnvironment } from "@/lib/environment";
import { useFeed } from "@/lib/use-feed";
import { useDialogKeyboard } from "@/lib/use-dialog-keyboard";
import { formatDateShort } from "@/lib/format";
import type { Category } from "@/lib/types";
import { AppText, Chip, IconButton, SectionLabel, Touchable } from "@/components/ui/primitives";
import { Icon, type IconName } from "@/components/ui/icon";
import { enter, exit, spring, timing } from "@/theme/motion";
import { colors, radius, space, type } from "@/theme/tokens";

/**
 * Painel da esquerda: buscar pensamentos e chegar às pastas rápido, de qualquer aba.
 *
 *  - Celular e tablet: desliza da borda esquerda por cima das abas (botão no cabeçalho de cada aba); fecha tocando
 *    fora, arrastando para a esquerda, com Esc (web) ou com o voltar do Android.
 *  - Computador (barra lateral com rótulos): fica fixo na própria barra, abaixo das abas.
 *
 * A busca procura nos títulos e textos (a mesma do servidor), com filtro de pasta; sem busca, o painel mostra as
 * pastas com a contagem e os atalhos (mapa de conexões, todas as pastas).
 */

type Dashboard = { open: () => void; close: () => void; docked: boolean };
const DashboardContext = createContext<Dashboard | null>(null);

/** null fora das abas (telas empilhadas por cima delas não têm o painel). */
export function useDashboard() {
  return useContext(DashboardContext);
}

export function DashboardProvider({ docked, children }: { docked: boolean; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const panelWidth = Math.min(360, Math.round(width * 0.86));
  const [mounted, setMounted] = useState(false);
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);

  const open = useCallback(() => setMounted(true), []);
  const close = useCallback(() => {
    progress.value = reduceMotion
      ? 0
      : withSpring(0, spring.sheet, (finished) => {
          if (finished) scheduleOnRN(setMounted, false);
        });
    if (reduceMotion) setMounted(false);
  }, [progress, reduceMotion]);

  useEffect(() => {
    if (!mounted) return;
    drag.value = 0;
    progress.value = reduceMotion ? 1 : withSpring(1, spring.sheet);
  }, [mounted, progress, drag, reduceMotion]);
  // Virou computador com o painel aberto: ele passa a ficar fixo na barra.
  useEffect(() => {
    if (docked && mounted) setMounted(false);
  }, [docked, mounted]);
  useEffect(() => {
    if (!mounted || Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [mounted, close]);
  useDialogKeyboard(mounted, close);

  const pan = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-20, 20],
    onUpdate: (event) => {
      "worklet";
      drag.value = Math.min(0, event.translationX);
    },
    onDeactivate: (event) => {
      "worklet";
      if (event.translationX < -panelWidth * 0.3 || event.velocityX < -700) scheduleOnRN(close);
      else drag.value = withSpring(0, spring.release);
    },
  });

  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value * 0.62 * Math.max(0, 1 + drag.value / panelWidth) }));
  const panel = useAnimatedStyle(() => ({ transform: [{ translateX: -(1 - progress.value) * (panelWidth + 24) + drag.value }] }));

  const value = useMemo(() => ({ open, close, docked }), [open, close, docked]);
  return (
    <DashboardContext.Provider value={value}>
      {children}
      {mounted && !docked ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]}>
            <Touchable accessibilityLabel="Fechar o painel" onPress={close} pressScale={1} style={StyleSheet.absoluteFill} />
          </Animated.View>
          <GestureDetector gesture={pan}>
            <Animated.View accessibilityViewIsModal style={[styles.drawer, { width: panelWidth, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.md, paddingLeft: insets.left + space.md }, panel]}>
              <DashboardPanel onNavigate={close} />
            </Animated.View>
          </GestureDetector>
        </View>
      ) : null}
    </DashboardContext.Provider>
  );
}

/** Botão que abre o painel (some no computador, onde ele já está fixo). */
export function DashboardButton() {
  const dashboard = useDashboard();
  if (!dashboard || dashboard.docked) return null;
  return <IconButton name="panel" label="Abrir o painel: buscar e pastas" onPress={dashboard.open} />;
}

/** O conteúdo do painel: busca, resultados, pastas e atalhos. */
export function DashboardPanel({ onNavigate, docked = false }: { onNavigate?: () => void; docked?: boolean }) {
  const { api, environment } = useCurrentEnvironment();
  const [categories, setCategories] = useState<(Category & { count: number })[] | null>(null);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [categoria, setCategoria] = useState<string | undefined>();
  const searching = query.length >= 2;
  const feed = useFeed(api, { q: searching ? query : undefined, categoria }, searching);
  const focus = useSharedValue(0);

  useEffect(() => {
    let alive = true;
    api.categories().then((r) => alive && setCategories(r.categories), () => alive && setCategories([]));
    return () => {
      alive = false;
    };
  }, [api]);
  // A busca sai sozinha um instante depois de parar de digitar.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 320);
    return () => clearTimeout(timer);
  }, [text]);

  const go = (href: Parameters<typeof router.push>[0]) => {
    onNavigate?.();
    router.push(href);
  };
  const field = useAnimatedStyle(() => ({ borderColor: interpolateColor(focus.value, [0, 1], [colors.lineStrong, colors.violet500]) }));
  const withPosts = (categories ?? []).filter((c) => c.count > 0);

  return (
    <View style={styles.panel}>
      {docked ? null : (
        <View style={styles.head}>
          <AppText variant="title" style={{ flex: 1 }}>{environment.name}</AppText>
          <IconButton name="close" label="Fechar o painel" color={colors.muted} onPress={() => onNavigate?.()} />
        </View>
      )}

      <Animated.View style={[styles.search, docked && styles.searchDocked, field]}>
        <Icon name="search" size={17} color={colors.faint} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Buscar pensamentos"
          placeholderTextColor={colors.faint}
          selectionColor={colors.violet400}
          returnKeyType="search"
          onSubmitEditing={() => setQuery(text.trim())}
          onFocus={() => (focus.value = withTiming(1, timing.micro))}
          onBlur={() => (focus.value = withTiming(0, timing.short))}
          maxLength={100}
          accessibilityLabel="Buscar pensamentos"
          nativeID="frame-focus-busca"
          style={styles.searchInput}
        />
        {text ? (
          <Touchable accessibilityLabel="Limpar a busca" hitSlop={8} pressScale={0.9} onPress={() => setText("")} style={styles.clear}>
            <Icon name="close" size={13} color={colors.muted} />
          </Touchable>
        ) : null}
      </Animated.View>

      {searching ? (
        <Animated.View key="resultados" entering={enter.fade} exiting={exit.fade} style={{ flex: 1 }}>
          {withPosts.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips} style={styles.chipsRow}>
              <Chip label="Todas" selected={!categoria} onPress={() => setCategoria(undefined)} />
              {withPosts.map((c) => (
                <Chip key={c.id} label={c.name} dot={c.color} selected={categoria === c.slug} onPress={() => setCategoria(categoria === c.slug ? undefined : c.slug)} />
              ))}
            </ScrollView>
          ) : null}
          <FlatList
            data={feed.loading ? [] : feed.posts}
            keyExtractor={(post) => post.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onEndReached={feed.loadMore}
            onEndReachedThreshold={0.5}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              !feed.loading && !feed.error ? (
                <AppText variant="label" color={colors.faint} style={styles.count}>
                  {feed.total} {feed.total === 1 ? "resultado" : "resultados"}
                </AppText>
              ) : undefined
            }
            renderItem={({ item }) => (
              <Touchable onPress={() => go({ pathname: "/post/[slug]", params: { slug: item.slug } })} pressScale={0.98} style={styles.result} accessibilityRole="link" accessibilityLabel={item.title}>
                <AppText variant="uiMedium" numberOfLines={2}>{item.title}</AppText>
                <View style={styles.resultMeta}>
                  {item.categories[0] ? <View style={[styles.dot, { backgroundColor: item.categories[0].color }]} /> : null}
                  <AppText variant="small" color={colors.faint} numberOfLines={1} style={{ flexShrink: 1 }}>
                    {[item.categories[0]?.name, formatDateShort(item.publishedAt)].filter(Boolean).join(" · ")}
                  </AppText>
                </View>
              </Touchable>
            )}
            ListEmptyComponent={
              <AppText variant="small" color={colors.muted} style={styles.empty}>
                {feed.loading ? "Buscando…" : feed.error ?? "Nada encontrado. Tente outras palavras ou outra pasta."}
              </AppText>
            }
          />
        </Animated.View>
      ) : (
        <Animated.View key="pastas" entering={enter.fade} exiting={exit.fade} style={{ flex: 1 }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
            <SectionLabel style={styles.section}>Pastas</SectionLabel>
            {categories === null ? (
              <AppText variant="small" color={colors.faint} style={styles.empty}>Carregando…</AppText>
            ) : categories.length ? (
              categories.map((c) => (
                <Touchable key={c.id} onPress={() => go({ pathname: "/categoria/[slug]", params: { slug: c.slug } })} pressScale={0.98} style={styles.row} accessibilityRole="link" accessibilityLabel={`${c.name}, ${c.count} ${c.count === 1 ? "pensamento" : "pensamentos"}`}>
                  <View style={[styles.dot, styles.dotLarge, { backgroundColor: c.color }]} />
                  <AppText numberOfLines={1} style={{ flex: 1 }}>{c.name}</AppText>
                  <AppText variant="small" color={colors.faint} style={styles.num}>{c.count}</AppText>
                </Touchable>
              ))
            ) : (
              <AppText variant="small" color={colors.faint} style={styles.empty}>Ainda não há pastas neste ambiente.</AppText>
            )}

            <SectionLabel style={styles.section}>Atalhos</SectionLabel>
            <Shortcut icon="map" label="Mapa de conexões" onPress={() => go("/mapa")} />
            <Shortcut icon="folder" label="Todas as pastas" onPress={() => go("/pastas")} />
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}

function Shortcut({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} pressScale={0.98} style={styles.row} accessibilityRole="link" accessibilityLabel={label}>
      <Icon name={icon} size={18} color={colors.violet300} />
      <AppText numberOfLines={1} style={{ flex: 1 }}>{label}</AppText>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "#000" },
  drawer: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: colors.surface, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.lineStrong, paddingHorizontal: space.md },
  panel: { flex: 1, gap: space.sm, minHeight: 0 },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.xs, marginBottom: space.xs },
  search: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44, paddingLeft: space.md, paddingRight: space.xs, borderRadius: radius.pill, borderWidth: 1, backgroundColor: colors.bg },
  searchDocked: { minHeight: 40 },
  searchInput: { ...type.ui, flex: 1, minWidth: 0, fontSize: 15, color: colors.text, paddingVertical: 9, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null) },
  clear: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  chipsRow: { flexGrow: 0, marginTop: space.xs },
  chips: { gap: space.xs, paddingRight: space.sm },
  list: { paddingBottom: space.lg, gap: 2 },
  count: { marginTop: space.sm, marginBottom: space.xs, paddingHorizontal: space.sm },
  section: { marginTop: space.md, marginBottom: space.xs, paddingHorizontal: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 44, paddingHorizontal: space.sm, borderRadius: radius.md },
  result: { gap: 4, paddingVertical: space.sm, paddingHorizontal: space.sm, borderRadius: radius.md },
  resultMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotLarge: { width: 9, height: 9, borderRadius: 5 },
  num: { fontVariant: ["tabular-nums"] },
  empty: { paddingHorizontal: space.sm, paddingVertical: space.md },
});
