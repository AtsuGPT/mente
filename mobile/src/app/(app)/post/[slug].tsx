import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import Animated from "react-native-reanimated";
import { readingMinutes, stripMarkdown } from "@shared/text";
import { useCurrentEnvironment } from "@/lib/environment";
import { formatDateLong, formatDateShort, formatNumber } from "@/lib/format";
import type { PostCard, PostFull } from "@/lib/types";
import { Markdown } from "@/components/markdown/markdown";
import { CategoryTag } from "@/components/post-card";
import { ThoughtAssistant } from "@/components/thought-assistant";
import { AppText, Divider, IconButton, SectionLabel, Skeleton, StateView, Touchable } from "@/components/ui/primitives";
import { enter } from "@/theme/motion";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius, space } from "@/theme/tokens";
import { useContainer, useLayout } from "@/theme/layout";

export default function PostScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { api, environment } = useCurrentEnvironment();
  const container = useContainer("reading");
  const { size } = useLayout();
  const [canEdit, setCanEdit] = useState(false);
  const [post, setPost] = useState<PostFull | null>(null);
  const [related, setRelated] = useState<PostCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.post(slug);
      setPost(result.post);
      setRelated(result.related);
      setCanEdit(result.canEdit);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível abrir este pensamento.");
    }
  }, [api, slug]);

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
            canEdit && post ? (
              <IconButton name="edit" label="Editar pensamento" color={colors.violet300} onPress={() => router.push({ pathname: "/editor/[id]", params: { id: post.id } })} />
            ) : null,
        }}
      />
      {!post ? (
        error ? (
          <StateView error={error} onRetry={() => void load()} />
        ) : (
          // A forma do texto aparece antes dele: título, data e parágrafos.
          <View style={[styles.content, container, { gap: space.md }]} accessibilityLabel="Carregando pensamento">
            <Skeleton style={{ width: 32, height: 2 }} />
            <Skeleton style={{ width: "86%", height: 34, marginTop: space.md }} />
            <Skeleton style={{ width: 180, height: 12 }} />
            <View style={{ height: space.lg }} />
            {[100, 96, 92, 98, 64].map((w, i) => <Skeleton key={i} style={{ width: `${w}%`, height: 15 }} />)}
          </View>
        )
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, container]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.violet400} />}
        >
          <Animated.View entering={enter.rise}>
            {primary ? <LinearGradient colors={[primary.color, `${primary.color}00`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.rule} /> : null}
            <View style={styles.meta}>
              {post.categories.map((category) => (
                <CategoryTag key={category.id} category={category} onPress={() => router.push({ pathname: "/categoria/[slug]", params: { slug: category.slug } })} />
              ))}
            </View>
            <AppText variant="display" accessibilityRole="header" style={[styles.title, size === "expanded" && styles.titleWide]}>{post.title}</AppText>
            <AppText variant="small" color={colors.muted}>
              {formatDateLong(post.publishedAt)} · {readingMinutes(post.content)} min de leitura
            </AppText>

            <Divider style={{ marginVertical: space.xl }} />
            <Markdown>{post.content}</Markdown>

            {/* A leitura assistida (IA) não foi alterada nesta etapa: vale só para o ambiente original. */}
            {environment.id === "mente" && stripMarkdown(post.content).length > 100 ? <ThoughtAssistant slug={post.slug} revision={post.updatedAt} /> : null}

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
  rule: { width: 96, height: 3, borderRadius: radius.pill, marginBottom: space.lg },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  title: { marginTop: space.md, marginBottom: space.md, fontSize: 34, lineHeight: 40 },
  titleWide: { fontSize: 44, lineHeight: 50, letterSpacing: -1 },
  related: { flexDirection: "row", alignItems: "baseline", gap: space.lg, padding: space.lg, marginTop: space.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.glass },
});
