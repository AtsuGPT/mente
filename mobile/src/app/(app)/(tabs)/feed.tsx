import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import Animated from "react-native-reanimated";
import { useCurrentEnvironment } from "@/lib/environment";
import { useFeed } from "@/lib/use-feed";
import type { Category } from "@/lib/types";
import { EnvironmentHeader } from "@/components/environment-header";
import { PostCard, PostCardSkeleton } from "@/components/post-card";
import { enter } from "@/theme/motion";
import { AppText, Chip, StateView, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { colors, radius, space } from "@/theme/tokens";
import { useContainer, useLayout } from "@/theme/layout";

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const container = useContainer("content");
  const { gutter } = useLayout();
  const { api, environment, permissions, session } = useCurrentEnvironment();
  const [categories, setCategories] = useState<(Category & { count: number })[]>([]);
  const [selected, setSelected] = useState<string | undefined>();
  const feed = useFeed(api, { categoria: selected });
  const canWrite = permissions.publish || permissions.manageContent;

  const loadCategories = useCallback(() => {
    api.categories().then((r) => setCategories(r.categories.filter((c) => c.count > 0))).catch(() => undefined);
  }, [api]);
  useEffect(loadCategories, [loadCategories]);

  // Ao voltar do editor, atualiza o feed. A função vem por ref: o efeito não depende da
  // identidade dela (era isso que, antes, disparava o laço de recarregamentos).
  const refreshRef = useRef(feed.refresh);
  refreshRef.current = feed.refresh;
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current && canWrite) void refreshRef.current();
      focusedBefore.current = true;
    }, [canWrite]),
  );

  const author = environment.name;
  // Cada cartão entra animado uma vez; rolar a lista e voltar não repete a entrada.
  const entered = useRef(new Set<string>());
  // Onde começa a última página carregada: os cartões novos (rolar até o fim) também entram em sequência,
  // contando a partir do primeiro deles, e não só os 8 primeiros da lista.
  const pages = useRef({ length: 0, start: 0 });
  const count = feed.loading ? 0 : feed.posts.length;
  if (count !== pages.current.length) pages.current = { length: count, start: count > pages.current.length ? pages.current.length : 0 };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={feed.loading ? [] : feed.posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[{ paddingTop: insets.top + space.md, paddingBottom: space.xxxl + 40, gap: space.md }, container]}
        refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={() => { loadCategories(); void feed.refresh(); }} tintColor={colors.violet400} />}
        onEndReachedThreshold={0.4}
        onEndReached={feed.loadMore}
        ListHeaderComponent={
          <View style={{ gap: space.lg, marginBottom: space.xs }}>
            <EnvironmentHeader title="Pensamentos" subtitle={environment.description || undefined} />

            <View style={styles.headingRow}>
              <AppText variant="heading">{selected ? categories.find((c) => c.slug === selected)?.name ?? "Pasta" : "Recentes"}</AppText>
              {!feed.loading ? <AppText variant="label" color={colors.faint}>{feed.total} {feed.total === 1 ? "pensamento" : "pensamentos"}</AppText> : null}
            </View>

            {categories.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: gutter }} style={{ marginHorizontal: -gutter }}>
                <Chip label="Todas" selected={!selected} onPress={() => setSelected(undefined)} />
                {categories.map((category) => (
                  <Chip
                    key={category.id}
                    label={category.name}
                    dot={category.color}
                    selected={selected === category.slug}
                    onPress={() => setSelected(selected === category.slug ? undefined : category.slug)}
                  />
                ))}
              </ScrollView>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => {
          const first = !entered.current.has(item.id);
          entered.current.add(item.id);
          const slot = index - pages.current.start;
          return (
          <Animated.View entering={first && slot >= 0 && slot < 8 ? enter.stagger(slot) : undefined}>
            {/* Destaque ocasional: só o mais recente, e só no feed completo. */}
            <PostCard post={item} author={author} avatar={session.image} featured={index === 0 && !selected} />
          </Animated.View>
          );
        }}
        ListEmptyComponent={
          feed.loading && !feed.error ? (
            <View style={{ gap: space.md }} accessibilityLabel="Carregando pensamentos">
              <PostCardSkeleton />
              <PostCardSkeleton />
              <PostCardSkeleton />
            </View>
          ) : (
          <StateView
            loading={feed.loading}
            error={feed.error}
            onRetry={feed.retry}
            empty={selected ? "Ainda não há pensamentos nesta pasta." : canWrite ? "Nenhum pensamento ainda. Toque em + para escrever o primeiro." : "Ainda não há pensamentos publicados aqui."}
          />
          )
        }
        ListFooterComponent={feed.loadingMore ? <ActivityIndicator color={colors.violet400} style={{ marginVertical: space.lg }} /> : undefined}
      />

      {canWrite ? (
        <Touchable
          accessibilityRole="button"
          accessibilityLabel="Novo pensamento"
          haptic
          onPress={() => router.push({ pathname: "/editor/[id]", params: { id: "novo" } })}
          style={[styles.fab, { right: gutter, bottom: gutter }]}
        >
          <Icon name="plus" size={24} color="#FFFFFF" strokeWidth={2} />
        </Touchable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  fab: {
    position: "absolute",
    right: space.lg,
    bottom: space.lg,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.violet600,
    borderWidth: 1,
    borderColor: "rgba(199,183,250,0.35)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.violet500,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
});
