import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, TextInput, View, type TextInputInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useCurrentEnvironment } from "@/lib/environment";
import { useFeed } from "@/lib/use-feed";
import type { Category } from "@/lib/types";
import { EnvironmentHeader } from "@/components/environment-header";
import { PostCard, PostCardSkeleton } from "@/components/post-card";
import { AppText, Button, Chip, StateView, TextField, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { enter, exit, layoutTransition, timing } from "@/theme/motion";
import { colors, radius, space, tint, type } from "@/theme/tokens";
import { useContainer, useLayout } from "@/theme/layout";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Mesmos filtros da página /buscar: texto, pasta e intervalo de datas. */
export default function SearchScreen() {
  const container = useContainer("content");
  const { gutter } = useLayout();
  const insets = useSafeAreaInsets();
  const { api, environment, session } = useCurrentEnvironment();
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState<string | undefined>();
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [showDates, setShowDates] = useState(false);
  const [filters, setFilters] = useState<{ q?: string; categoria?: string; de?: string; ate?: string } | null>(null);
  const feed = useFeed(api, filters ?? {}, filters !== null);
  const input = useRef<TextInputInstance>(null);
  const focus = useSharedValue(0);

  useEffect(() => {
    api.categories().then((r) => setCategories(r.categories)).catch(() => undefined);
  }, []);

  const dateError = (de && !DATE.test(de)) || (ate && !DATE.test(ate)) ? "Use o formato AAAA-MM-DD." : undefined;
  const dateCount = (de ? 1 : 0) + (ate ? 1 : 0);

  function submit() {
    if (dateError) return;
    input.current?.blur();
    setFilters({ q: q.trim() || undefined, categoria, de: de || undefined, ate: ate || undefined });
  }

  // Campo de busca: fio cinza que acende em roxo no foco (sem halo).
  const field = useAnimatedStyle(() => ({ borderColor: interpolateColor(focus.value, [0, 1], [colors.lineStrong, colors.violet500]) }));

  const searching = filters !== null && feed.loading;

  return (
    <FlatList
      data={filters && !feed.loading ? feed.posts : []}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={[{ paddingTop: insets.top + space.md, gap: space.md, paddingBottom: space.xxxl }, container]}
      onEndReached={feed.loadMore}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <View style={{ gap: space.lg, marginBottom: space.xs }}>
          <EnvironmentHeader title="Buscar" />

          <Animated.View style={[styles.search, field]}>
            <Icon name="search" size={18} color={colors.faint} />
            <TextInput
              ref={input}
              value={q}
              onChangeText={setQ}
              placeholder="Palavras no título ou no texto"
              placeholderTextColor={colors.faint}
              selectionColor={colors.violet400}
              returnKeyType="search"
              onSubmitEditing={submit}
              onFocus={() => (focus.value = withTiming(1, timing.micro))}
              onBlur={() => (focus.value = withTiming(0, timing.short))}
              maxLength={100}
              accessibilityLabel="Buscar pensamentos"
              style={styles.searchInput}
            />
            {q ? (
              <Animated.View entering={enter.fade} exiting={exit.fade}>
                <Touchable accessibilityLabel="Limpar busca" hitSlop={8} pressScale={0.9} onPress={() => setQ("")} style={styles.clear}>
                  <Icon name="close" size={14} color={colors.muted} />
                </Touchable>
              </Animated.View>
            ) : null}
          </Animated.View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.sm, paddingHorizontal: gutter }} style={{ marginHorizontal: -gutter }}>
            <Chip label={dateCount ? `Período · ${dateCount}` : "Período"} selected={showDates || dateCount > 0} onPress={() => setShowDates((v) => !v)} />
            <View style={styles.separator} />
            <Chip label="Todas as pastas" selected={!categoria} onPress={() => setCategoria(undefined)} />
            {categories.map((c) => (
              <Chip key={c.id} label={c.name} dot={c.color} selected={categoria === c.slug} onPress={() => setCategoria(categoria === c.slug ? undefined : c.slug)} />
            ))}
          </ScrollView>

          {showDates ? (
            <Animated.View entering={enter.rise} exiting={exit.fade} layout={layoutTransition} style={{ gap: space.sm }}>
              <View style={styles.dates}>
                <TextField label="De" value={de} onChangeText={setDe} placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} containerStyle={{ flex: 1 }} />
                <TextField label="Até" value={ate} onChangeText={setAte} placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} containerStyle={{ flex: 1 }} />
              </View>
              {dateError ? <AppText variant="small" color={colors.danger}>{dateError}</AppText> : null}
            </Animated.View>
          ) : null}

          <Animated.View layout={layoutTransition}>
            <Button label="Buscar" icon="search" onPress={submit} loading={searching} disabled={!!dateError} />
          </Animated.View>

          {filters && !feed.loading && !feed.error ? (
            <Animated.View entering={enter.fade} style={styles.resultsRow}>
              <AppText variant="label" color={colors.faint}>{feed.total} {feed.total === 1 ? "resultado" : "resultados"}</AppText>
              {filters.q ? <AppText variant="small" color={colors.muted} numberOfLines={1} style={{ flexShrink: 1 }}>para “{filters.q}”</AppText> : null}
            </Animated.View>
          ) : null}
        </View>
      }
      renderItem={({ item, index }) => (
        <Animated.View entering={index < 8 ? enter.stagger(index) : undefined}>
          <PostCard post={item} author={environment.name} avatar={session.image} />
        </Animated.View>
      )}
      ListEmptyComponent={
        searching ? (
          <View style={{ gap: space.md }} accessibilityLabel="Buscando">
            <PostCardSkeleton />
            <PostCardSkeleton />
          </View>
        ) : filters ? (
          <StateView error={feed.error} onRetry={feed.retry} empty="Nenhum pensamento encontrado. Tente outras palavras, outra pasta ou um período maior." />
        ) : (
          <Animated.View entering={enter.fade} style={styles.hint}>
            <View style={styles.hintIcon}>
              <Icon name="search" size={20} color={colors.violet300} />
            </View>
            <AppText color={colors.muted} style={{ textAlign: "center" }}>Procure por palavras do título ou do texto, filtre por pasta ou por período.</AppText>
          </Animated.View>
        )
      }
      ListFooterComponent={feed.loadingMore ? <ActivityIndicator color={colors.violet400} style={{ marginVertical: space.lg }} /> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 50, paddingLeft: space.lg, paddingRight: space.sm, borderRadius: radius.pill, borderWidth: 1, backgroundColor: colors.surface },
  searchInput: { ...type.ui, flex: 1, fontSize: 16, color: colors.text, paddingVertical: 12 },
  clear: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  separator: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", marginVertical: 6, backgroundColor: colors.lineStrong },
  dates: { flexDirection: "row", gap: space.md },
  resultsRow: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  hint: { alignItems: "center", gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  hintIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: tint.selected, borderWidth: StyleSheet.hairlineWidth, borderColor: tint.selectedBorder },
});
