import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, Stack, useFocusEffect } from "expo-router";
import { useCurrentEnvironment } from "@/lib/environment";
import { formatDateShort, formatNumber } from "@/lib/format";
import type { AdminPostRow, Category } from "@/lib/types";
import { AppText, Chip, IconButton, StateView, TextField, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { colors, radius, space } from "@/theme/tokens";
import { useContainer } from "@/theme/layout";

type Status = "all" | "draft" | "published";

function statusOf(post: AdminPostRow) {
  if (post.status === "DRAFT") return { label: "Rascunho", color: colors.warning };
  if (post.publishedAt && new Date(post.publishedAt) > new Date()) return { label: "Agendado", color: colors.violet300 };
  return { label: "Publicado", color: colors.success };
}

/** Lista do painel: rascunhos, publicados e agendados. */
export default function AdminPostsScreen() {
  const container = useContainer("content");
  const { api } = useCurrentEnvironment();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [categoria, setCategoria] = useState<string | undefined>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [posts, setPosts] = useState<AdminPostRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(
    async (target: number) => {
      const id = ++request.current;
      try {
        const result = await api.managePosts({ q: query || undefined, status, categoria, pagina: target });
        if (id !== request.current) return;
        setPosts((current) => (target === 1 ? result.posts : [...current, ...result.posts]));
        setPage(result.page);
        setPageCount(result.pageCount);
        setTotal(result.total);
        setError(null);
      } catch (cause) {
        if (id === request.current) setError(cause instanceof Error ? cause.message : "Não foi possível carregar.");
      } finally {
        if (id === request.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [query, status, categoria],
  );

  useEffect(() => {
    api.manageCategories().then((r) => setCategories(r.categories)).catch(() => undefined);
  }, []);

  // Recarrega ao voltar do editor.
  useFocusEffect(
    useCallback(() => {
      void load(1);
    }, [load]),
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton name="plus" label="Novo pensamento" color={colors.violet300} onPress={() => router.push({ pathname: "/editor/[id]", params: { id: "novo" } })} />
          ),
        }}
      />
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[{ padding: space.lg, gap: space.sm, paddingBottom: space.xxxl }, container]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(1); }} tintColor={colors.violet400} />}
        onEndReached={() => page < pageCount && void load(page + 1)}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <TextField value={q} onChangeText={setQ} placeholder="Título, texto ou endereço" returnKeyType="search" onSubmitEditing={() => setQuery(q.trim())} />
            <View style={{ flexDirection: "row", gap: space.sm }}>
              {(["all", "draft", "published"] as const).map((s) => (
                <Chip key={s} label={s === "all" ? "Todos" : s === "draft" ? "Rascunhos" : "Publicados"} selected={status === s} onPress={() => setStatus(s)} />
              ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              <Chip label="Todas as categorias" selected={!categoria} onPress={() => setCategoria(undefined)} />
              {categories.map((c) => (
                <Chip key={c.id} label={c.name} dot={c.color} selected={categoria === c.id} onPress={() => setCategoria(categoria === c.id ? undefined : c.id)} />
              ))}
            </ScrollView>
            <AppText variant="label" color={colors.faint}>{total} {total === 1 ? "pensamento" : "pensamentos"}</AppText>
          </View>
        }
        renderItem={({ item }) => {
          const s = statusOf(item);
          return (
            <Touchable onPress={() => router.push({ pathname: "/editor/[id]", params: { id: item.id } })} style={styles.row}>
              <View style={[styles.edge, { backgroundColor: item.categories[0]?.color ?? colors.lineStrong }]} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
                  <AppText variant="label" color={colors.faint}>{formatNumber(item.number)}</AppText>
                  <AppText variant="label" color={s.color}>{s.label}</AppText>
                  {item.private ? <Icon name="lock" size={13} color={colors.muted} /> : null}
                </View>
                <AppText variant="uiMedium" numberOfLines={2}>{item.title || "Sem título"}</AppText>
                <AppText variant="small" color={colors.faint} numberOfLines={1}>
                  {item.categories.map((c) => c.name).join(" · ") || "Sem categoria"} · {item.status === "DRAFT" || !item.publishedAt ? `editado ${formatDateShort(item.updatedAt)}` : formatDateShort(item.publishedAt)}
                </AppText>
              </View>
            </Touchable>
          );
        }}
        ListEmptyComponent={<StateView loading={loading} error={error} onRetry={() => void load(1)} empty="Nada encontrado com esses filtros." />}
        ListFooterComponent={page < pageCount ? <ActivityIndicator color={colors.violet400} style={{ marginVertical: space.lg }} /> : undefined}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.md, padding: space.md, paddingLeft: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.glass, overflow: "hidden" },
  edge: { position: "absolute", left: 0, top: space.md, bottom: space.md, width: 2 },
});
