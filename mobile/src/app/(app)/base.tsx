import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Platform, RefreshControl, StyleSheet, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { api } from "@/lib/api";
import type { KallyDocument } from "@/lib/types";
import { AppText, Button, Chip, IconButton, StateView } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { colors, radius, space } from "@/theme/tokens";
import { useContainer } from "@/theme/layout";

type Data = { documents: KallyDocument[]; canManageInstitutional: boolean; enabled: boolean };

const STATUS: Record<KallyDocument["status"], string> = { processando: "Indexando…", pronto: "Pronto", erro: "Erro" };

/**
 * Bases de documentos da Kally: a pessoal (PDFs, artigos e notas que só você consulta) e a
 * institucional (documentos de referência, para todos; só o administrador altera).
 */
export default function KnowledgeBaseScreen() {
  const container = useContainer("content");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [scope, setScope] = useState<"pessoal" | "institucional">("pessoal");

  const load = useCallback(async () => {
    try {
      setData(await api.kallyDocuments());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a base.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // Enquanto algum documento é indexado (em segundo plano no servidor), confere de tempos em tempos.
  const processing = !!data?.documents.some((d) => d.status === "processando");
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => void load(), 5_000);
    return () => clearInterval(timer);
  }, [processing, load]);

  async function add() {
    const result = await DocumentPicker.getDocumentAsync({ type: Platform.OS === "web" ? ["application/pdf", "text/*", ".md", ".csv", ".docx"] : ["*/*"], copyToCacheDirectory: true });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    if ((asset.size ?? 0) > 15 * 1024 * 1024) return Alert.alert("Documento", "Documentos devem ter no máximo 15 MB.");
    const part = Platform.OS === "web" ? (asset.file ?? (await (await fetch(asset.uri)).blob())) : (new File(asset.uri) as unknown as Blob);
    const form = new FormData();
    form.append("file", part, asset.name);
    form.append("scope", scope);
    setUploading(true);
    try {
      const r = await api.addKallyDocument(form);
      if (r.reused) Alert.alert("Documento", "Este conteúdo já está na base.");
      await load();
    } catch (cause) {
      Alert.alert("Documento", cause instanceof Error ? cause.message : "Não consegui enviar o documento.");
    } finally {
      setUploading(false);
    }
  }

  function remove(document: KallyDocument) {
    const run = () =>
      api.deleteKallyDocument(document.id).then(load, (cause) => Alert.alert("Documento", cause instanceof Error ? cause.message : "Não consegui remover."));
    const question = `Remover "${document.title}" da base? A Kally deixa de consultá-lo.`;
    if (Platform.OS === "web") {
      if (window.confirm(question)) void run();
      return;
    }
    Alert.alert("Remover documento?", question, [
      { text: "Cancelar", style: "cancel" },
      { text: "Remover", style: "destructive", onPress: () => void run() },
    ]);
  }

  if (!data) return <StateView loading={!error} error={error} onRetry={error ? () => void load() : undefined} />;

  return (
    <FlatList
      contentContainerStyle={[{ padding: space.lg, gap: space.md }, container]}
      data={data.documents}
      keyExtractor={(d) => d.id}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.violet300} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={{ gap: space.md }}>
          <AppText color={colors.muted}>
            A Kally consulta estes documentos na hora de responder e diz de onde tirou cada informação. Os seus só você consulta; os de referência valem para todos. Nada disso treina o modelo.
          </AppText>
          {!data.enabled ? <AppText variant="small" color={colors.warning}>Por enquanto a Kally consulta as bases só no modo em teste.</AppText> : null}
          {data.canManageInstitutional ? (
            <View style={styles.chips}>
              <Chip label="Minha base" selected={scope === "pessoal"} onPress={() => setScope("pessoal")} />
              <Chip label="Institucional" selected={scope === "institucional"} onPress={() => setScope("institucional")} />
            </View>
          ) : null}
          <Button label={scope === "institucional" ? "Adicionar à base institucional" : "Adicionar documento"} icon="doc" loading={uploading} onPress={() => void add()} />
          <AppText variant="small" color={colors.faint}>PDF, DOCX, TXT, MD ou CSV, até 15 MB. Documentos longos levam alguns minutos para ficar prontos.</AppText>
        </View>
      }
      ListEmptyComponent={<AppText color={colors.faint}>Nenhum documento ainda.</AppText>}
      renderItem={({ item }) => {
        const canRemove = item.scope === "pessoal" || data.canManageInstitutional;
        return (
          <View style={styles.row}>
            <Icon name="doc" size={18} color={item.scope === "institucional" ? colors.violet200 : colors.violet300} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="uiMedium" numberOfLines={2}>{item.title}</AppText>
              <AppText variant="small" color={colors.faint} numberOfLines={1}>
                {item.scope === "institucional" ? "Referência" : "Seu documento"} · {item.origin}
              </AppText>
              <AppText variant="small" color={item.status === "erro" ? colors.danger : item.status === "pronto" ? colors.success : colors.violet300} numberOfLines={2}>
                {STATUS[item.status]}
                {item.status === "pronto" ? ` · ${item._count.chunks} trechos` : ""}
                {item.status === "erro" && item.detail ? ` · ${item.detail}` : ""}
              </AppText>
            </View>
            {canRemove ? <IconButton name="close" label={`Remover ${item.title}`} color={colors.muted} onPress={() => remove(item)} /> : null}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.violet800, backgroundColor: colors.glass },
});
