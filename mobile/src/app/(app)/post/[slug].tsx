import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import { readingMinutes, stripMarkdown } from "@shared/text";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateLong, formatDateShort, formatNumber } from "@/lib/format";
import type { PostCard, PostFull } from "@/lib/types";
import { Markdown } from "@/components/markdown/markdown";
import { CategoryTag } from "@/components/post-card";
import { ThoughtAssistant } from "@/components/thought-assistant";
import { AppText, Divider, IconButton, SectionLabel, StateView, Touchable } from "@/components/ui/primitives";
import { colors, space } from "@/theme/tokens";

export default function PostScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { isAdmin } = useAuth();
  const [post, setPost] = useState<PostFull | null>(null);
  const [related, setRelated] = useState<PostCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.post(slug);
      setPost(result.post);
      setRelated(result.related);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível abrir este pensamento.");
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const primary = post?.categories[0];

  return (
    <>
      <Stack.Screen
        options={{
          title: post ? `Nº ${formatNumber(post.number)}` : "",
          headerRight: () =>
            isAdmin && post ? (
              <IconButton name="edit" label="Editar pensamento" color={colors.violet300} onPress={() => router.push({ pathname: "/editor/[id]", params: { id: post.id } })} />
            ) : null,
        }}
      />
      {!post ? (
        <StateView loading={!error} error={error} onRetry={() => void load()} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.violet400} />}
        >
          <Animated.View entering={FadeIn.duration(300)}>
            {primary ? <View style={[styles.rule, { backgroundColor: primary.color }]} /> : null}
            <View style={styles.meta}>
              {post.categories.map((category) => (
                <CategoryTag key={category.id} category={category} onPress={() => router.push({ pathname: "/categoria/[slug]", params: { slug: category.slug } })} />
              ))}
            </View>
            <AppText variant="display" style={styles.title}>{post.title}</AppText>
            <AppText variant="small" color={colors.muted}>
              {formatDateLong(post.publishedAt)} · {readingMinutes(post.content)} min de leitura
            </AppText>

            <Divider style={{ marginVertical: space.xl }} />
            <Markdown>{post.content}</Markdown>

            {stripMarkdown(post.content).length > 100 ? <ThoughtAssistant slug={post.slug} revision={post.updatedAt} /> : null}

            {related.length ? (
              <View style={{ marginTop: space.xxxl }}>
                <SectionLabel>Continue lendo</SectionLabel>
                {related.map((item) => (
                  <Touchable key={item.id} onPress={() => router.push({ pathname: "/post/[slug]", params: { slug: item.slug } })} style={styles.related}>
                    <AppText variant="title" style={{ flex: 1, fontSize: 20, lineHeight: 26 }}>{item.title}</AppText>
                    <AppText variant="label" color={colors.faint}>{formatDateShort(item.publishedAt)}</AppText>
                  </Touchable>
                ))}
              </View>
            ) : null}
          </Animated.View>
        </ScrollView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  rule: { width: 32, height: 2, marginBottom: space.lg },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  title: { marginTop: space.md, marginBottom: space.md, fontSize: 34, lineHeight: 40 },
  related: { flexDirection: "row", alignItems: "baseline", gap: space.lg, paddingVertical: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
});
