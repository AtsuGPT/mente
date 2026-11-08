import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { readableAccent } from "@shared/color";
import { useCurrentEnvironment } from "@/lib/environment";
import { useFeed } from "@/lib/use-feed";
import type { Category } from "@/lib/types";
import { PostCard } from "@/components/post-card";
import { AppText, StateView } from "@/components/ui/primitives";
import { colors, space } from "@/theme/tokens";
import { useContainer } from "@/theme/layout";

/** Uma pasta (categoria) e seus pensamentos. */
export default function CategoryScreen() {
  const container = useContainer("content");
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { api, environment, session } = useCurrentEnvironment();
  const [category, setCategory] = useState<Category | null>(null);
  const feed = useFeed(api, { categoria: slug });

  useEffect(() => {
    api.categories().then((r) => setCategory(r.categories.find((c) => c.slug === slug) ?? null)).catch(() => undefined);
  }, [slug]);

  return (
    <>
      <Stack.Screen options={{ title: category?.name ?? "" }} />
      <FlatList
        data={feed.loading ? [] : feed.posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[{ padding: space.lg, paddingBottom: space.xxxl, gap: space.md }, container]}
        refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={() => void feed.refresh()} tintColor={colors.violet400} />}
        onEndReached={feed.loadMore}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          category ? (
            <View style={{ marginBottom: space.md }}>
              <LinearGradient colors={[category.color, `${category.color}00`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: 96, height: 3, borderRadius: 2, marginBottom: space.md }} />
              <AppText variant="label" color={readableAccent(category.color)}>Pasta</AppText>
              <AppText variant="display" style={{ marginTop: space.xs }}>{category.name}</AppText>
              {category.description ? <AppText color={colors.muted} style={{ marginTop: space.sm }}>{category.description}</AppText> : null}
              {!feed.loading ? <AppText variant="label" color={colors.faint} style={{ marginTop: space.md }}>{feed.total} {feed.total === 1 ? "pensamento" : "pensamentos"}</AppText> : null}
            </View>
          ) : undefined
        }
        renderItem={({ item }) => <PostCard post={item} author={environment.name} avatar={session.image} />}
        ListEmptyComponent={<StateView loading={feed.loading} error={feed.error} onRetry={feed.retry} empty="Ainda não há posts nesta pasta." />}
        ListFooterComponent={feed.loadingMore ? <ActivityIndicator color={colors.violet400} style={{ marginVertical: space.lg }} /> : undefined}
      />
    </>
  );
}
