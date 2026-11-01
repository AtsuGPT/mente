import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useFeed } from "@/lib/use-feed";
import type { Category } from "@/lib/types";
import { Avatar, PostCard } from "@/components/post-card";
import { AppText, Chip, StateView, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { colors, fonts, radius, space } from "@/theme/tokens";

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { session, isAdmin } = useAuth();
  const [categories, setCategories] = useState<(Category & { count: number })[]>([]);
  const [selected, setSelected] = useState<string | undefined>();
  const feed = useFeed({ categoria: selected });

  const loadCategories = useCallback(() => {
    api.categories().then((r) => setCategories(r.categories.filter((c) => c.count > 0))).catch(() => undefined);
  }, []);
  useEffect(loadCategories, [loadCategories]);

  // Volta do editor com algo novo: atualiza sem perder a posição do filtro.
  const { refresh } = feed;
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current && isAdmin) void refresh();
      focusedBefore.current = true;
    }, [isAdmin, refresh]),
  );

  const author = session?.site.author ?? "kayk";

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
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <AppText variant="label" color={colors.violet300}>{author}</AppText>
                <AppText variant="title" style={{ marginTop: 2 }}>
                  Minha <AppText variant="title" style={{ fontFamily: fonts.serifItalic, color: colors.violet200 }}>Mente</AppText>
                </AppText>
              </View>
              <Touchable accessibilityLabel="Conta" onPress={() => router.push("/conta")}>
                <Avatar src={session?.profileImage} size={40} />
              </Touchable>
            </View>

            <View style={styles.headingRow}>
              <AppText variant="heading">{selected ? categories.find((c) => c.slug === selected)?.name ?? "Pasta" : "Feed de pensamentos"}</AppText>
              {!feed.loading ? <AppText variant="label" color={colors.faint}>{feed.total} {feed.total === 1 ? "post" : "posts"}</AppText> : null}
            </View>

            {categories.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} style={{ marginHorizontal: -space.lg }}>
                <View style={{ width: space.lg - space.sm }} />
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
                <View style={{ width: space.lg - space.sm }} />
              </ScrollView>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={index < 6 ? FadeIn.delay(index * 50).duration(300) : undefined}>
            <PostCard post={item} author={author} avatar={session?.profileImage} />
          </Animated.View>
        )}
        ListEmptyComponent={
          <StateView
            loading={feed.loading}
            error={feed.error}
            onRetry={feed.retry}
            empty={selected ? "Ainda não há posts nesta pasta." : "Ainda não há pensamentos publicados."}
          />
        }
        ListFooterComponent={feed.loadingMore ? <ActivityIndicator color={colors.violet400} style={{ marginVertical: space.lg }} /> : undefined}
      />

      {isAdmin ? (
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
  header: { flexDirection: "row", alignItems: "center", gap: space.md },
  headingRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  fab: {
    position: "absolute",
    right: space.lg,
    bottom: space.lg,
    width: 54,
    height: 54,
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
