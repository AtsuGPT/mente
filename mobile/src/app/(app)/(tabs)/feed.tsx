import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import { useCurrentEnvironment } from "@/lib/environment";
import { useFeed } from "@/lib/use-feed";
import type { Category } from "@/lib/types";
import { EnvironmentHeader } from "@/components/environment-header";
import { PostCard } from "@/components/post-card";
import { AppText, Chip, StateView, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { colors, radius, space } from "@/theme/tokens";

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={feed.loading ? [] : feed.posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: insets.top + space.md, paddingBottom: space.xxxl + 40, gap: space.md }}
        refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={() => { loadCategories(); void feed.refresh(); }} tintColor={colors.violet400} />}
        onEndReachedThreshold={0.4}
        onEndReached={feed.loadMore}
        ListHeaderComponent={
          <View style={{ gap: space.lg, marginBottom: space.xs }}>
            <EnvironmentHeader title="Pensamentos" subtitle={environment.description || undefined} />

            <View style={styles.headingRow}>
              <AppText variant="heading">{selected ? categories.find((c) => c.slug === selected)?.name ?? "Pasta" : "Feed"}</AppText>
              {!feed.loading ? <AppText variant="label" color={colors.faint}>{feed.total} {feed.total === 1 ? "pensamento" : "pensamentos"}</AppText> : null}
            </View>

            {categories.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }} style={{ marginHorizontal: -space.lg }}>
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
        renderItem={({ item, index }) => (
          <Animated.View entering={index < 6 ? FadeIn.delay(index * 50).duration(300) : undefined}>
            <PostCard post={item} author={author} avatar={session.image} />
          </Animated.View>
        )}
        ListEmptyComponent={
          <StateView
            loading={feed.loading}
            error={feed.error}
            onRetry={feed.retry}
            empty={selected ? "Ainda não há pensamentos nesta pasta." : canWrite ? "Nenhum pensamento ainda. Toque em + para escrever o primeiro." : "Ainda não há pensamentos publicados aqui."}
          />
        }
        ListFooterComponent={feed.loadingMore ? <ActivityIndicator color={colors.violet400} style={{ marginVertical: space.lg }} /> : undefined}
      />

      {canWrite ? (
        <Touchable
          accessibilityRole="button"
          accessibilityLabel="Novo pensamento"
          haptic
          onPress={() => router.push({ pathname: "/editor/[id]", params: { id: "novo" } })}
          style={styles.fab}
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
    borderColor: colors.violet500,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.violet500,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
});
