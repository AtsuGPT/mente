import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import Animated from "react-native-reanimated";
import { useCurrentEnvironment } from "@/lib/environment";
import type { Category, KallyLearningTopic } from "@/lib/types";
import { formatAgo } from "@/lib/format";
import { EnvironmentHeader } from "@/components/environment-header";
import { AppText, Button, SectionLabel, Skeleton, StateView, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { GlassIcon } from "@/components/ui/glass-icon";
import { enter } from "@/theme/motion";
import { colors, fonts, radius, space } from "@/theme/tokens";
import { useLayout } from "@/theme/layout";

type Mastery = KallyLearningTopic["mastery"];
type Folder = Category & { count: number; progress: Record<Mastery, number>; topics: number };

const MASTERY_COLOR: Record<Mastery, string> = { dominado: colors.success, estudando: colors.violet400, dificuldade: colors.warning };
const MASTERY_LABEL: Record<Mastery, string> = { dominado: "dominado", estudando: "estudando", dificuldade: "com dificuldade" };

/**
 * Estudos (aba nova do redesign, 27/11): o que a pessoa está estudando. No alto, os tópicos mais recentes para
 * continuar com a Kally; embaixo, as pastas com o progresso real de domínio (dos tópicos que a Kally registrou).
 * Só dados que já existem: categorias do ambiente e o progresso de estudo da própria pessoa.
 */
export default function StudiesScreen() {
  const insets = useSafeAreaInsets();
  const { gutter, width, sidebar, size } = useLayout();
  const { api } = useCurrentEnvironment();
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [recent, setRecent] = useState<(KallyLearningTopic & { folder?: Category })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const mainWidth = width - (!sidebar ? 0 : size === "expanded" ? 236 : 84);
  const columns = mainWidth >= 1240 ? 3 : mainWidth >= 780 ? 2 : 1;

  const load = useCallback(async () => {
    try {
      const [{ categories }, all] = await Promise.all([api.categories(), api.kallyProgress().catch(() => ({ topics: [] as KallyLearningTopic[] }))]);
      // Progresso por pasta: uma consulta por pasta (são poucas), em paralelo. Guarda de que pasta é cada tópico,
      // para "Continuar" abrir a conversa nova já na pasta certa.
      const folderOf = new Map<string, Category>();
      const withProgress = await Promise.all(
        categories.map(async (category) => {
          const { topics } = await api.kallyProgress(category.id).catch(() => ({ topics: [] as KallyLearningTopic[] }));
          const progress = { dominado: 0, estudando: 0, dificuldade: 0 } as Record<Mastery, number>;
          for (const topic of topics) {
            progress[topic.mastery] += 1;
            folderOf.set(topic.id, category);
          }
          return { ...category, progress, topics: topics.length };
        }),
      );
      setRecent([...all.topics].sort((a, b) => b.lastStudiedAt.localeCompare(a.lastStudiedAt)).slice(0, 4).map((t) => ({ ...t, folder: folderOf.get(t.id) })));
      setFolders(withProgress);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os estudos.");
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  // Voltando de uma conversa de estudo, o progresso pode ter mudado.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const container = useMemo(() => ({ width: "100%" as const, maxWidth: columns === 1 ? 840 + gutter * 2 : 1680, alignSelf: "center" as const, paddingHorizontal: columns === 1 ? gutter : gutter + space.lg }), [columns, gutter]);

  return (
    <ScrollView
      contentContainerStyle={[{ paddingTop: insets.top + space.md, paddingBottom: space.xxxl + 40, gap: space.xl }, container]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.violet400} />}
    >
      <EnvironmentHeader title="Estudos" subtitle="O que você está aprendendo, pasta por pasta." />

      {recent.length ? (
        <View style={{ gap: space.sm }}>
          <SectionLabel>Continuar estudando</SectionLabel>
          <View style={[styles.grid, columns > 1 && { gap: space.md }]}>
            {recent.map((topic, index) => (
              <Animated.View key={topic.id} entering={enter.stagger(index)} style={columns > 1 ? { width: `${100 / Math.min(columns, 2) - 1.5}%` as const } : { width: "100%" }}>
                <Touchable
                  onPress={() => (topic.folder ? router.push({ pathname: "/perguntar", params: { pasta: topic.folder.id, pastaNome: topic.folder.name, topico: topic.title } }) : router.push("/perguntar"))}
                  pressScale={0.985}
                  style={styles.topic}
                  accessibilityLabel={`Continuar estudando ${topic.title}`}
                >
                  <View style={[styles.ring, { borderColor: MASTERY_COLOR[topic.mastery], backgroundColor: `${MASTERY_COLOR[topic.mastery]}26` }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="uiMedium" numberOfLines={1}>{topic.title}</AppText>
                    <AppText variant="small" color={colors.faint} numberOfLines={1}>{topic.folder ? `${topic.folder.name} · ` : ""}{MASTERY_LABEL[topic.mastery]} · {formatAgo(topic.lastStudiedAt)}</AppText>
                  </View>
                  <AppText variant="small" color={colors.violet300} style={{ fontFamily: fonts.sansMedium }}>Continuar</AppText>
                </Touchable>
              </Animated.View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ gap: space.sm }}>
        <View style={styles.sectionRow}>
          <SectionLabel>Pastas</SectionLabel>
          <Touchable onPress={() => router.push("/conhecimento")} pressScale={0.96} style={styles.mapLink} accessibilityLabel="Abrir o mapa de conhecimento">
            <Icon name="mapas" size={17} color={colors.violet300} />
            <AppText variant="small" color={colors.violet300} style={{ fontFamily: fonts.sansMedium }}>Mapa de conhecimento</AppText>
          </Touchable>
        </View>
        {folders === null ? (
          error ? (
            <StateView error={error} onRetry={() => void load()} />
          ) : (
            <View style={styles.grid} accessibilityLabel="Carregando as pastas">
              {[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 112, width: columns > 1 ? `${100 / columns - 2}%` : "100%", borderRadius: radius.lg }} />)}
            </View>
          )
        ) : folders.length ? (
          <View style={[styles.grid, columns > 1 && { gap: space.md }]}>
            {folders.map((folder, index) => (
              <Animated.View key={folder.id} entering={enter.stagger(index)} style={columns > 1 ? { width: `${100 / columns - 1.5}%` as const } : { width: "100%" }}>
                <FolderCard folder={folder} />
              </Animated.View>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <AppText variant="body" color={colors.muted} style={{ textAlign: "center" }}>Ainda não há pastas. Elas aparecem quando você guarda pensamentos ou conversas da Kally numa pasta.</AppText>
            <Button label="Estudar com a Kally" icon="kally" compact variant="secondary" onPress={() => router.push("/perguntar")} />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function FolderCard({ folder }: { folder: Folder }) {
  const total = folder.progress.dominado + folder.progress.estudando + folder.progress.dificuldade;
  return (
    <Touchable onPress={() => router.push({ pathname: "/categoria/[slug]", params: { slug: folder.slug } })} pressScale={0.985} style={styles.folder} accessibilityLabel={`Pasta ${folder.name}`}>
      <View style={styles.folderHead}>
        <GlassIcon name="pastas" size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <View style={[styles.folderDot, { backgroundColor: folder.color }]} />
            <AppText variant="title" numberOfLines={1} style={styles.folderName}>{folder.name}</AppText>
          </View>
        </View>
      </View>
      <AppText variant="small" color={colors.faint}>
        {folder.topics} {folder.topics === 1 ? "tópico" : "tópicos"} · {folder.count} {folder.count === 1 ? "pensamento" : "pensamentos"}
      </AppText>
      {total ? (
        <View style={{ gap: 6 }}>
          <View style={styles.bar} accessibilityLabel={`${folder.progress.dominado} dominados, ${folder.progress.estudando} estudando, ${folder.progress.dificuldade} com dificuldade`}>
            {(["dominado", "estudando", "dificuldade"] as const).map((m) =>
              folder.progress[m] ? <View key={m} style={{ flex: folder.progress[m], backgroundColor: MASTERY_COLOR[m], borderRadius: 99 }} /> : null,
            )}
          </View>
          <AppText variant="small" color={colors.faint}>
            {folder.progress.dominado} dominados · {folder.progress.estudando} estudando{folder.progress.dificuldade ? ` · ${folder.progress.dificuldade} com dificuldade` : ""}
          </AppText>
        </View>
      ) : (
        <AppText variant="small" color={colors.faint}>Nenhum tópico estudado ainda.</AppText>
      )}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, justifyContent: "space-between" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  mapLink: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  topic: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: "rgba(255,255,255,0.02)" },
  ring: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  folder: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  folderHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  folderDot: { width: 9, height: 9, borderRadius: 5 },
  folderName: { flex: 1, fontSize: 22, lineHeight: 28 },
  bar: { flexDirection: "row", height: 6, gap: 3, borderRadius: 99, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.05)" },
  empty: { alignItems: "center", gap: space.md, paddingVertical: space.xl },
});
