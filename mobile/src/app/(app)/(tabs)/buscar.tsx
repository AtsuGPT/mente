import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCurrentEnvironment } from "@/lib/environment";
import { useFeed } from "@/lib/use-feed";
import type { Category } from "@/lib/types";
import { PostCard } from "@/components/post-card";
import { AppText, Button, Chip, StateView, TextField } from "@/components/ui/primitives";
import { colors, space } from "@/theme/tokens";
import { useContainer } from "@/theme/layout";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Mesmos filtros da página /buscar: texto, pasta e intervalo de datas. */
export default function SearchScreen() {
  const container = useContainer("content");
  const insets = useSafeAreaInsets();
  const { api, environment, session } = useCurrentEnvironment();
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState<string | undefined>();
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [filters, setFilters] = useState<{ q?: string; categoria?: string; de?: string; ate?: string } | null>(null);
  const feed = useFeed(api, filters ?? {}, filters !== null);

  useEffect(() => {
    api.categories().then((r) => setCategories(r.categories)).catch(() => undefined);
  }, []);

  const dateError = (de && !DATE.test(de)) || (ate && !DATE.test(ate)) ? "Use o formato AAAA-MM-DD." : undefined;

  function submit() {
    if (dateError) return;
    setFilters({ q: q.trim() || undefined, categoria, de: de || undefined, ate: ate || undefined });
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={filters && !feed.loading ? feed.posts : []}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[{ padding: space.lg, paddingTop: insets.top + space.md, gap: space.md, paddingBottom: space.xxxl }, container]}
      onEndReached={feed.loadMore}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <View style={{ gap: space.lg, marginBottom: space.sm }}>
          <AppText variant="title">Buscar</AppText>
          <TextField value={q} onChangeText={setQ} placeholder="Palavras no título ou no texto" returnKeyType="search" onSubmitEditing={submit} maxLength={100} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            <Chip label="Todas as pastas" selected={!categoria} onPress={() => setCategoria(undefined)} />
            {categories.map((c) => (
              <Chip key={c.id} label={c.name} dot={c.color} selected={categoria === c.slug} onPress={() => setCategoria(categoria === c.slug ? undefined : c.slug)} />
            ))}
          </ScrollView>
          <View style={styles.dates}>
            <TextField label="De" value={de} onChangeText={setDe} placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} containerStyle={{ flex: 1 }} />
            <TextField label="Até" value={ate} onChangeText={setAte} placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} containerStyle={{ flex: 1 }} />
          </View>
          {dateError ? <AppText variant="small" color={colors.danger}>{dateError}</AppText> : null}
          <Button label="Buscar" icon="search" onPress={submit} loading={feed.loading && filters !== null} />
          {filters && !feed.loading && !feed.error ? (
            <AppText variant="label" color={colors.faint}>{feed.total} {feed.total === 1 ? "resultado" : "resultados"}</AppText>
          ) : null}
        </View>
      }
      renderItem={({ item }) => <PostCard post={item} author={environment.name} avatar={session.image} />}
      ListEmptyComponent={filters ? <StateView error={feed.error} onRetry={feed.retry} empty={feed.loading ? undefined : "Nenhum pensamento encontrado."} /> : undefined}
      ListFooterComponent={feed.loadingMore ? <ActivityIndicator color={colors.violet400} style={{ marginVertical: space.lg }} /> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  dates: { flexDirection: "row", gap: space.md },
});
