import { useCallback, useEffect, useState } from "react";
import { FlatList, Platform, RefreshControl, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Alert } from "@/lib/alert";
import { useCurrentEnvironment } from "@/lib/environment";
import { formatDateShort } from "@/lib/format";
import type { KallyConversation, KallyMemoryItem } from "@/lib/types";
import { AppText, Button, Chip, IconButton, StateView, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { colors, radius, space } from "@/theme/tokens";
import { useContainer } from "@/theme/layout";
import KnowledgeBaseScreen from "./base";

type Section = "conversas" | "memoria" | "base";

const KIND_LABEL: Record<KallyMemoryItem["kind"], string> = { preferencia: "Preferência", fato: "Sobre você", objetivo: "Objetivo", contexto: "Contexto" };

/**
 * Painel da Kally: as conversas salvas deste ambiente, a memória (o que a Kally guardou do que a pessoa contou
 * em conversas salvas) e a base pessoal de documentos. Tudo é só da própria pessoa.
 */
export default function KallyPanelScreen() {
  const [section, setSection] = useState<Section>("conversas");
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.tabs}>
        <Chip label="Conversas" selected={section === "conversas"} onPress={() => setSection("conversas")} />
        <Chip label="Memória" selected={section === "memoria"} onPress={() => setSection("memoria")} />
        <Chip label="Base pessoal" selected={section === "base"} onPress={() => setSection("base")} />
      </View>
      {section === "conversas" ? <Conversations /> : section === "memoria" ? <Memory /> : <KnowledgeBaseScreen />}
    </View>
  );
}

function confirmThen(title: string, question: string, action: string, run: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(question)) run();
    return;
  }
  Alert.alert(title, question, [
    { text: "Cancelar", style: "cancel" },
    { text: action, style: "destructive", onPress: run },
  ]);
}

function Conversations() {
  const { api } = useCurrentEnvironment();
  const container = useContainer("content");
  const [list, setList] = useState<KallyConversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      setList((await api.kallyConversations()).conversations);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não consegui carregar as conversas.");
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!list) return <StateView loading={!error} error={error} onRetry={error ? () => void load() : undefined} />;
  return (
    <FlatList
      contentContainerStyle={[{ padding: space.lg, gap: space.md }, container]}
      data={list}
      keyExtractor={(c) => c.id}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.violet300} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={<AppText color={colors.muted}>Conversas que você salvou neste ambiente. Só você vê. As temporárias não aparecem aqui.</AppText>}
      ListEmptyComponent={<AppText color={colors.faint}>Nenhuma conversa salva ainda. Nos pedidos maiores, a Kally pergunta se você quer salvar.</AppText>}
      renderItem={({ item }) => (
        <Touchable style={styles.row} onPress={() => router.push({ pathname: "/perguntar", params: { conversa: item.id } })}>
          <Icon name="chat" size={18} color={colors.violet300} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="uiMedium" numberOfLines={2}>{item.title}</AppText>
            <AppText variant="small" color={colors.faint}>{formatDateShort(item.updatedAt)}</AppText>
          </View>
          <IconButton
            name="trash"
            label={`Apagar ${item.title}`}
            color={colors.muted}
            onPress={() => confirmThen("Apagar conversa?", `Apagar a conversa "${item.title}"?`, "Apagar", () => void api.deleteKallyConversation(item.id).then(load, () => undefined))}
          />
        </Touchable>
      )}
    />
  );
}

function Memory() {
  const { api } = useCurrentEnvironment();
  const container = useContainer("content");
  const [data, setData] = useState<{ enabled: boolean; memories: KallyMemoryItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await api.kallyMemories());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não consegui carregar a memória.");
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!data) return <StateView loading={!error} error={error} onRetry={error ? () => void load() : undefined} />;
  return (
    <FlatList
      contentContainerStyle={[{ padding: space.lg, gap: space.md }, container]}
      data={data.memories}
      keyExtractor={(m) => m.id}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.violet300} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={{ gap: space.md }}>
          <AppText color={colors.muted}>
            O que a Kally guardou do que você contou em conversas salvas, para as respostas ficarem mais do seu jeito. Ela consulta só o que tem a ver com cada pergunta. Só você vê, e pode apagar qualquer item.
          </AppText>
          {!data.enabled ? <AppText variant="small" color={colors.warning}>A memória está desligada no servidor.</AppText> : null}
          {data.memories.length ? (
            <Button
              label="Apagar toda a memória"
              variant="secondary"
              icon="trash"
              compact
              onPress={() => confirmThen("Apagar a memória?", "A Kally esquece tudo o que guardou de você neste ambiente. As conversas salvas continuam.", "Apagar tudo", () => void api.clearKallyMemories().then(load, () => undefined))}
            />
          ) : null}
        </View>
      }
      ListEmptyComponent={<AppText color={colors.faint}>Nada guardado ainda. Conte algo sobre você numa conversa salva (o que faz, do que gosta, como prefere as respostas) e a Kally guarda.</AppText>}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Icon name="brain" size={18} color={colors.violet300} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText>{item.text}</AppText>
            <AppText variant="small" color={colors.faint}>
              {KIND_LABEL[item.kind] ?? item.kind} · {formatDateShort(item.updatedAt)}
              {item.uses ? ` · usada ${item.uses} ${item.uses === 1 ? "vez" : "vezes"}` : ""}
            </AppText>
          </View>
          <IconButton name="trash" label="Esquecer este item" color={colors.muted} onPress={() => void api.deleteKallyMemory(item.id).then(load, () => undefined)} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md, flexWrap: "wrap" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.violet800, backgroundColor: colors.glass },
});
