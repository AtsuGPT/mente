import { useCallback, useEffect, useState } from "react";
import { FlatList, Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Alert } from "@/lib/alert";
import { useCurrentEnvironment } from "@/lib/environment";
import { api as accountApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateShort } from "@/lib/format";
import type { KallyConversation, KallyMemoryItem, KallyPerf, KallyPerfWindow } from "@/lib/types";
import { AppText, Button, Chip, IconButton, SectionLabel, StateView, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { colors, radius, space } from "@/theme/tokens";
import { useContainer } from "@/theme/layout";
import KnowledgeBaseScreen from "./base";

type Section = "conversas" | "memoria" | "base" | "desempenho";

const KIND_LABEL: Record<KallyMemoryItem["kind"], string> = { preferencia: "Preferência", fato: "Sobre você", objetivo: "Objetivo", contexto: "Contexto" };

/**
 * Painel da Kally: as conversas salvas deste ambiente, a memória (o que a Kally guardou do que a pessoa contou
 * em conversas salvas) e a base pessoal de documentos. Tudo é só da própria pessoa.
 */
export default function KallyPanelScreen() {
  const [section, setSection] = useState<Section>("conversas");
  // Desempenho: só o administrador da plataforma (a rota responde 404 para as outras contas).
  const admin = useAuth().user?.legacyKind === "ADMIN";
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.tabs}>
        <Chip label="Conversas" selected={section === "conversas"} onPress={() => setSection("conversas")} />
        <Chip label="Memória" selected={section === "memoria"} onPress={() => setSection("memoria")} />
        <Chip label="Base pessoal" selected={section === "base"} onPress={() => setSection("base")} />
        {admin ? <Chip label="Desempenho" selected={section === "desempenho"} onPress={() => setSection("desempenho")} /> : null}
      </View>
      {section === "conversas" ? <Conversations /> : section === "memoria" ? <Memory /> : section === "desempenho" && admin ? <Performance /> : <KnowledgeBaseScreen />}
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

/** Segundos com uma casa ("2,4 s"); sem medida, um travessão. */
const sec = (v: number | null | undefined) => (typeof v === "number" ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s` : "—");
const shortModel = (m: string | null) => (m ? m.replace(/^openai\//, "").replace(/-iq4xs$/, "") : "—");

/**
 * Desempenho da Kally (logs/kally-perf.jsonl resumido no servidor): quanto demora a primeira palavra e a resposta,
 * erros, quedas para o modelo local, uso da internet, gasto da API no dia e os últimos pedidos. Só tempos e contagens:
 * o registro não guarda mensagens nem quem perguntou.
 */
function Performance() {
  const container = useContainer("content");
  const [data, setData] = useState<KallyPerf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await accountApi.kallyPerformance());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não consegui carregar o desempenho.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!data) return <StateView loading={!error} error={error} onRetry={error ? () => void load() : undefined} />;
  const spend = Object.entries(data.gastoHoje.models);
  const spent = spend.reduce((n, [, v]) => n + v.usd, 0);
  return (
    <ScrollView
      contentContainerStyle={[{ padding: space.lg, gap: space.lg }, container]}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.violet300} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <AppText color={colors.muted}>Tempos de cada pedido à Kally, de todos os ambientes. Só números: nada das mensagens nem de quem perguntou. Só você vê.</AppText>
      {Object.entries(data.janelas).map(([label, w]) => (
        <PerfWindow key={label} label={label} w={w} />
      ))}
      <View style={{ gap: space.sm }}>
        <SectionLabel>Gasto da API hoje</SectionLabel>
        <View style={styles.card}>
          <AppText variant="title">{`US$ ${spent.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`}</AppText>
          <AppText variant="small" color={colors.faint}>{`Limite por modelo: US$ ${data.gastoHoje.limitUsd.toLocaleString("pt-BR")} por dia`}</AppText>
          {spend.map(([model, v]) => (
            <AppText key={model} variant="small" color={colors.muted}>{`${shortModel(model)}: US$ ${v.usd.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} em ${v.requests} pedidos`}</AppText>
          ))}
        </View>
      </View>
      <View style={{ gap: space.sm }}>
        <SectionLabel>Últimos pedidos</SectionLabel>
        {data.recentes.map((r, i) => (
          <View key={`${r.at}-${i}`} style={styles.perfRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="small" color={colors.text}>{`${shortModel(r.modelo)} · ${r.modo ?? "conversa"}${r.esforco ? ` · ${r.esforco}` : ""}`}</AppText>
              <AppText variant="small" color={colors.faint}>
                {new Date(r.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                {r.pensamentos ? ` · ${r.pensamentos} pensamentos` : ""}
                {r.internet ? ` · ${r.internet} fontes` : ""}
                {r.tokensPorSegundo ? ` · ${r.tokensPorSegundo} tokens/s` : ""}
              </AppText>
              {r.erro || r.queda ? <AppText variant="small" color={r.erro ? colors.danger : colors.warning}>{r.erro ?? `Caiu para o local: ${r.queda}`}</AppText> : null}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <AppText variant="small" color={colors.violet200}>{sec(r.primeiraPalavra)}</AppText>
              <AppText variant="small" color={colors.faint}>{sec(r.total)}</AppText>
            </View>
          </View>
        ))}
        {!data.recentes.length ? <AppText color={colors.faint}>Nenhum pedido registrado ainda.</AppText> : null}
      </View>
    </ScrollView>
  );
}

function PerfWindow({ label, w }: { label: string; w: KallyPerfWindow }) {
  return (
    <View style={{ gap: space.sm }}>
      <SectionLabel>{`Últimas ${label}`}</SectionLabel>
      <View style={styles.card}>
        <View style={styles.stats}>
          <Stat label="Pedidos" value={String(w.pedidos)} />
          <Stat label="1ª palavra (mediana)" value={sec(w.primeiraPalavra?.mediana)} />
          <Stat label="1ª palavra (9 em 10)" value={sec(w.primeiraPalavra?.p90)} />
          <Stat label="Resposta (mediana)" value={sec(w.total?.mediana)} />
        </View>
        <AppText variant="small" color={colors.faint}>
          {`Erros: ${w.erros} · quedas para o local: ${w.quedasParaLocal} · com internet: ${w.comInternet} · busca (mediana): ${sec(w.busca?.mediana)}`}
        </AppText>
        {w.porModelo.map((m) => (
          <AppText key={m.modelo} variant="small" color={colors.muted}>
            {`${shortModel(m.modelo)}: ${m.pedidos} pedidos · 1ª palavra ${sec(m.primeiraPalavraMediana)}${m.tokensPorSegundo ? ` · ${Math.round(m.tokensPorSegundo)} tokens/s` : ""}`}
          </AppText>
        ))}
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="title">{value}</AppText>
      <AppText variant="small" color={colors.faint}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.violet800, backgroundColor: colors.glass },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  stat: { minWidth: 120, flexGrow: 1, gap: 2 },
  perfRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  tabs: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md, flexWrap: "wrap" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.violet800, backgroundColor: colors.glass },
});
