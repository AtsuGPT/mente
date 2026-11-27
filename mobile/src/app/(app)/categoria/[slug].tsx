import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { readableAccent } from "@shared/color";
import { useCurrentEnvironment } from "@/lib/environment";
import { useFeed } from "@/lib/use-feed";
import { formatDateShort, formatNumber } from "@/lib/format";
import type { Category, KallyLearningTopic } from "@/lib/types";
import { FolderStudy, MASTERY_STYLE, masteryCounts, type FolderConversation } from "@/components/folder-study";
import { GlassIcon } from "@/components/ui/glass-icon";
import { AppText, Button, StateView, Touchable } from "@/components/ui/primitives";
import { colors, fonts, radius, space } from "@/theme/tokens";
import { useLayout } from "@/theme/layout";

/**
 * Uma pasta (categoria), redesign de 27/11: o cartão da pasta com o ícone, os números e o domínio; embaixo, o estudo
 * da pessoa (revisão, tópicos com "Nova conversa", conversas) e os materiais. No computador, em duas colunas.
 */
export default function CategoryScreen() {
  const { gutter, width } = useLayout();
  const split = width >= 1100;
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { api } = useCurrentEnvironment();
  const [category, setCategory] = useState<Category | null>(null);
  const [topics, setTopics] = useState<KallyLearningTopic[] | null>(null);
  const [conversations, setConversations] = useState<FolderConversation[] | null>(null);
  const feed = useFeed(api, { categoria: slug });

  useEffect(() => {
    api.categories().then((r) => setCategory(r.categories.find((c) => c.slug === slug) ?? null)).catch(() => undefined);
  }, [api, slug]);
  // Volta da Kally com tópico ou conversa nova: recarrega ao voltar para a tela.
  const loadStudy = useCallback(() => {
    if (!category) return;
    let alive = true;
    api.kallyProgress(category.id).then((r) => alive && setTopics(r.topics), () => alive && setTopics([]));
    api.kallyFolderConversations(category.id).then((r) => alive && setConversations(r.conversations), () => alive && setConversations([]));
    return () => {
      alive = false;
    };
  }, [api, category]);
  useFocusEffect(loadStudy);

  const container = { width: "100%" as const, maxWidth: (split ? 1240 : 840) + gutter * 2, alignSelf: "center" as const, paddingHorizontal: gutter };
  if (!category) return <StateView loading />;
  const counts = masteryCounts(topics ?? []);
  const total = counts.dominado + counts.estudando + counts.dificuldade;
  const accent = readableAccent(category.color);
  const openKally = () => router.push({ pathname: "/perguntar", params: { pasta: category.id, pastaNome: category.name } });

  const materials = (
    <View style={{ gap: space.sm }}>
      <View style={styles.sect}>
        <AppText variant="label" color={colors.faint}>Materiais</AppText>
        {!feed.loading ? <AppText variant="small" color={colors.faint}>{feed.total} {feed.total === 1 ? "pensamento" : "pensamentos"}</AppText> : null}
      </View>
      {feed.loading ? (
        <ActivityIndicator color={colors.violet400} style={{ marginVertical: space.lg }} />
      ) : feed.posts.length ? (
        <View style={styles.list}>
          {feed.posts.map((post, i) => (
            <Touchable key={post.id} onPress={() => router.push({ pathname: "/post/[slug]", params: { slug: post.slug } })} pressScale={0.99} style={[styles.material, i < feed.posts.length - 1 && styles.divider]}>
              <GlassIcon name="pensamentos" size={32} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="uiMedium" numberOfLines={1}>{post.title}</AppText>
                <AppText variant="small" color={colors.faint} numberOfLines={1}>
                  <AppText variant="small" style={{ fontFamily: fonts.serifItalic, color: accent }}>Nº {formatNumber(post.number)}</AppText> · {formatDateShort(post.publishedAt)}
                </AppText>
              </View>
            </Touchable>
          ))}
        </View>
      ) : (
        <StateView error={feed.error} onRetry={feed.retry} empty="Ainda não há pensamentos nesta pasta." />
      )}
      {feed.posts.length < feed.total ? <Button label={feed.loadingMore ? "Carregando…" : "Carregar mais"} variant="ghost" compact onPress={feed.loadMore} /> : null}
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: category.name }} />
      <ScrollView
        contentContainerStyle={[{ paddingTop: space.lg, paddingBottom: space.xxxl, gap: space.xl }, container]}
        refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={() => { void feed.refresh(); loadStudy(); }} tintColor={colors.violet400} />}
      >
        {/* Cartão da pasta: ícone, nome, números, domínio e as ações. */}
        <View style={[styles.hero, split && styles.heroWide]}>
          <LinearGradient colors={[`${category.color}33`, `${category.color}00`]} start={{ x: 0, y: 0 }} end={{ x: 0.55, y: 0.9 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <GlassIcon name="pastas" size={split ? 120 : 76} />
          <View style={{ flex: 1, minWidth: 0, gap: space.sm }}>
            <AppText variant="label" color={accent}>Pasta</AppText>
            <AppText variant="display" numberOfLines={2} style={split ? styles.titleWide : styles.title}>{category.name}</AppText>
            {category.description ? <AppText variant="body" color={colors.muted}>{category.description}</AppText> : null}
            <View style={styles.stats}>
              {[
                [topics?.length ?? "—", "tópicos"],
                [feed.loading ? "—" : feed.total, "pensamentos"],
                [conversations?.length ?? "—", "conversas"],
              ].map(([n, label]) => (
                <View key={String(label)}>
                  <AppText style={styles.statValue}>{String(n)}</AppText>
                  <AppText variant="small" color={colors.faint}>{label}</AppText>
                </View>
              ))}
            </View>
            {total ? (
              <View style={{ gap: 6, maxWidth: 520 }}>
                <View style={styles.bar}>
                  {(["dominado", "estudando", "dificuldade"] as const).map((m) =>
                    counts[m] ? <View key={m} style={{ flex: counts[m], height: 6, borderRadius: 99, backgroundColor: m === "estudando" ? colors.violet400 : MASTERY_STYLE[m].color }} /> : null,
                  )}
                </View>
                <AppText variant="small" color={colors.faint}>
                  {counts.dominado} dominados · {counts.estudando} estudando{counts.dificuldade ? ` · ${counts.dificuldade} com dificuldade` : ""}
                </AppText>
              </View>
            ) : null}
            <View style={styles.actions}>
              <Button label="Estudar com a Kally" icon="sparkle" compact onPress={openKally} />
              <Button label="Ver no mapa" icon="mapas" variant="secondary" compact onPress={() => router.push("/conhecimento")} />
            </View>
          </View>
        </View>

        {split ? (
          <View style={styles.columns}>
            <View style={{ flex: 6, minWidth: 0 }}>
              {topics && conversations ? <FolderStudy category={category} topics={topics} conversations={conversations} /> : <ActivityIndicator color={colors.violet400} />}
            </View>
            <View style={{ flex: 5, minWidth: 0 }}>{materials}</View>
          </View>
        ) : (
          <>
            {topics && conversations ? <FolderStudy category={category} topics={topics} conversations={conversations} /> : <ActivityIndicator color={colors.violet400} />}
            {materials}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "flex-start", gap: space.lg, padding: space.xl, borderRadius: radius.xl, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: colors.surface, overflow: "hidden" },
  heroWide: { padding: space.xxl, gap: space.xl },
  title: { fontSize: 34, lineHeight: 38 },
  titleWide: { fontSize: 46, lineHeight: 50 },
  stats: { flexDirection: "row", gap: space.xl, marginTop: space.xs },
  statValue: { fontFamily: fonts.serifMedium, fontSize: 26, lineHeight: 30, color: colors.text },
  bar: { flexDirection: "row", gap: 3 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm },
  columns: { flexDirection: "row", alignItems: "flex-start", gap: space.xxl },
  sect: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingHorizontal: 2 },
  list: { borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: colors.surface, overflow: "hidden" },
  material: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 12, paddingHorizontal: 14 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
});
