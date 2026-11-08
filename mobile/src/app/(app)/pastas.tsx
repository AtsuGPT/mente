import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useCurrentEnvironment } from "@/lib/environment";
import type { Category } from "@/lib/types";
import { AppText, StateView, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { colors, radius, space } from "@/theme/tokens";
import { useContainer } from "@/theme/layout";

/** Equivalente à página /arquivo do site: pensamentos organizados por assunto. */
export default function FoldersScreen() {
  const container = useContainer("content");
  const { api } = useCurrentEnvironment();
  const [categories, setCategories] = useState<(Category & { count: number })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setCategories((await api.categories()).categories);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as pastas.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <FlatList
      data={categories ?? []}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[{ padding: space.lg, gap: space.sm }, container]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.violet400} />}
      ListHeaderComponent={<AppText color={colors.muted} style={{ marginBottom: space.md }}>Pensamentos organizados por assunto.</AppText>}
      renderItem={({ item }) => (
        <Touchable onPress={() => router.push({ pathname: "/categoria/[slug]", params: { slug: item.slug } })} style={styles.row}>
          <View style={[styles.icon, { borderColor: item.color }]}>
            <Icon name="folder" size={18} color={item.color} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="uiMedium">{item.name}</AppText>
            {item.description ? <AppText variant="small" color={colors.muted} numberOfLines={2}>{item.description}</AppText> : null}
          </View>
          <AppText variant="label" color={colors.faint}>{item.count}</AppText>
        </Touchable>
      )}
      ListEmptyComponent={<StateView loading={!categories && !error} error={error} onRetry={() => void load()} empty="Ainda não há pastas." />}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  icon: { width: 38, height: 38, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
});
