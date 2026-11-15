import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import Animated from "react-native-reanimated";
import { useCurrentEnvironment } from "@/lib/environment";
import { ARTIFACT_KINDS, KIND_INFO } from "@/lib/artifact";
import type { ArtifactCard as Card } from "@/lib/types";
import { EnvironmentHeader } from "@/components/environment-header";
import { ArtifactCard } from "@/components/artifact/artifact-card";
import { AppText, Button, Chip, Skeleton, StateView, TextField, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { enter } from "@/theme/motion";
import { colors, radius, space } from "@/theme/tokens";
import { useContainer, useLayout } from "@/theme/layout";

/**
 * Biblioteca de artefatos do ambiente, separada do feed: busca, filtros por tipo, favoritos, os meus, pastas (categorias)
 * e cartões. Tocar num cartão abre a página do artefato; "+" cria um à mão; "Pedir à Kally" abre a conversa já com o
 * comando /artefato.
 */
export default function ArtifactsScreen() {
  const insets = useSafeAreaInsets();
  const container = useContainer("content");
  const { gutter, width } = useLayout();
  const { api, environment } = useCurrentEnvironment();
  const [items, setItems] = useState<Card[]>([]);
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string | undefined>();
  const [category, setCategory] = useState<string | undefined>();
  const [only, setOnly] = useState<"favoritos" | "meus" | undefined>();
  const columns = width >= 680 ? 2 : 1;

  const seq = useRef(0);
  const load = useCallback(
    async (mode: "first" | "refresh" | "quiet" = "first") => {
      const mine = ++seq.current;
      if (mode === "first") setLoading(true);
      if (mode === "refresh") setRefreshing(true);
      try {
        const r = await api.artifacts({ q: q.trim() || undefined, tipo: kind, categoria: category, favoritos: only === "favoritos", meus: only === "meus" });
        if (mine !== seq.current) return;
        setItems(r.artifacts);
        setCategories(r.categories);
        setCanCreate(r.canCreate);
        setError(null);
      } catch (cause) {
        if (mine === seq.current) setError(cause instanceof Error ? cause.message : "Não consegui carregar os artefatos.");
      } finally {
        if (mine === seq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [api, q, kind, category, only],
  );

  // Busca com uma pequena pausa enquanto a pessoa digita; filtros na hora.
  useEffect(() => {
    const timer = setTimeout(() => void load(items.length ? "quiet" : "first"), q ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // Ao voltar de um artefato (salvo, apagado, favoritado), atualiza sem piscar.
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) void load("quiet");
      focusedBefore.current = true;
    }, [load]),
  );

  const toggleFavorite = useCallback(
    (item: Card) => {
      setItems((list) => list.map((a) => (a.id === item.id ? { ...a, favorite: !a.favorite } : a)));
      api.setArtifactFavorite(item.id, !item.favorite).catch(() => setItems((list) => list.map((a) => (a.id === item.id ? { ...a, favorite: item.favorite } : a))));
    },
    [api],
  );

  const askKally = () => router.push({ pathname: "/perguntar", params: { rascunho: "/artefato " } });
  const filtered = !!(q || kind || category || only);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        key={`cols-${columns}`}
        data={loading ? [] : items}
        numColumns={columns}
        keyExtractor={(item) => item.id}
        columnWrapperStyle={columns > 1 ? { gap: space.md } : undefined}
        contentContainerStyle={[{ paddingTop: insets.top + space.md, paddingBottom: space.xxxl + 40, gap: space.md }, container]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor={colors.violet400} />}
        ListHeaderComponent={
          <View style={{ gap: space.lg, marginBottom: space.xs }}>
            <EnvironmentHeader title="Artefatos" subtitle={`Simuladores, gráficos, diagramas e ferramentas de ${environment.name}, feitos por vocês e pela Kally.`} />
            <View style={styles.actions}>
              <Button label="Pedir à Kally" icon="kally" onPress={askKally} compact style={{ flex: 1 }} />
              {canCreate ? <Button label="Criar à mão" icon="code" variant="secondary" onPress={() => router.push("/artefato/novo")} compact style={{ flex: 1 }} /> : null}
            </View>
            <TextField value={q} onChangeText={setQ} placeholder="Buscar por nome, descrição ou pasta" returnKeyType="search" accessibilityLabel="Buscar artefatos" autoCorrect={false} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: gutter }} style={{ marginHorizontal: -gutter }}>
              <Chip label="Todos" selected={!kind && !only} onPress={() => { setKind(undefined); setOnly(undefined); }} />
              <Chip label="Favoritos" selected={only === "favoritos"} onPress={() => setOnly(only === "favoritos" ? undefined : "favoritos")} />
              <Chip label="Meus" selected={only === "meus"} onPress={() => setOnly(only === "meus" ? undefined : "meus")} />
              {ARTIFACT_KINDS.map((k) => (
                <Chip key={k} label={KIND_INFO[k].plural} dot={KIND_INFO[k].color} selected={kind === k} onPress={() => setKind(kind === k ? undefined : k)} />
              ))}
            </ScrollView>
            {categories.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: gutter }} style={{ marginHorizontal: -gutter }}>
                <AppText variant="label" color={colors.faint} style={styles.folderLabel}>Pastas</AppText>
                {categories.map((c) => (
                  <Chip key={c.name} label={c.name} count={c.count} selected={category === c.name} onPress={() => setCategory(category === c.name ? undefined : c.name)} />
                ))}
              </ScrollView>
            ) : null}
            {!loading ? (
              <AppText variant="label" color={colors.faint}>
                {items.length} {items.length === 1 ? "artefato" : "artefatos"}
              </AppText>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={index < 9 ? enter.stagger(index) : undefined} style={{ flex: 1 / columns }}>
            <ArtifactCard item={item} onToggleFavorite={toggleFavorite} />
          </Animated.View>
        )}
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: space.md }} accessibilityLabel="Carregando artefatos">
              <Skeleton style={styles.skeleton} />
              <Skeleton style={styles.skeleton} />
            </View>
          ) : error ? (
            <StateView error={error} onRetry={() => void load("first")} />
          ) : filtered ? (
            <StateView empty="Nenhum artefato com esses filtros." />
          ) : (
            <View style={styles.empty}>
              <Icon name="cube" size={30} color={colors.violet400} />
              <AppText variant="heading" style={{ textAlign: "center" }}>Ainda não há artefatos aqui</AppText>
              <AppText variant="small" color={colors.muted} style={{ textAlign: "center", maxWidth: 420 }}>
                Peça à Kally algo que funcione: &quot;cria um simulador de circuito RC&quot;, &quot;faz um gráfico da função seno com controles&quot;, &quot;monta um quiz de anatomia&quot;. Quando aparecer na conversa, toque em Salvar.
              </AppText>
            </View>
          )
        }
      />
      {canCreate ? (
        <Touchable accessibilityRole="button" accessibilityLabel="Novo artefato" haptic onPress={() => router.push("/artefato/novo")} style={[styles.fab, { right: gutter, bottom: gutter }]}>
          <Icon name="plus" size={24} color="#FFFFFF" strokeWidth={2} />
        </Touchable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: space.sm },
  folderLabel: { alignSelf: "center", marginRight: space.xs },
  skeleton: { height: 120, borderRadius: radius.lg },
  empty: { alignItems: "center", gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  fab: { position: "absolute", width: 56, height: 56, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.violet600, borderWidth: 1, borderColor: "rgba(199,183,250,0.32)" },
});
