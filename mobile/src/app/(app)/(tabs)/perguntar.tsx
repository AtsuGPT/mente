import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { streamEvents } from "@/lib/stream";
import { useAuth } from "@/lib/auth";
import { useCurrentEnvironment } from "@/lib/environment";
import { extractDraft, handOffDraft } from "@/lib/draft-handoff";
import { formatDateShort } from "@/lib/format";
import type { KallyConversation, KallyMode, KallySource } from "@/lib/types";
import { Markdown } from "@/components/markdown/markdown";
import { EnvironmentHeader } from "@/components/environment-header";
import { VoiceButton } from "@/components/voice-button";
import { AppText, Button, Chip, IconButton, StateView, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { colors, radius, space, type } from "@/theme/tokens";

/**
 * Kally: assistente de aprendizagem do ambiente atual. As conversas ficam salvas
 * no servidor, por pessoa e por ambiente. Dois modos: perguntar sobre os pensamentos
 * do ambiente, ou transformar uma ideia (texto ou voz) em rascunho para o editor.
 */

type Message = { id: string; role: "user" | "assistant"; content: string; sources?: KallySource[] };

const suggestions: Record<KallyMode, string[]> = {
  chat: ["Quais temas aparecem mais aqui?", "Explique a ideia central do pensamento mais recente", "Que relações existem entre os pensamentos?"],
  ideia: ["Tenho uma ideia, mas ainda está confusa…", "Quero escrever sobre algo que vivi hoje"],
};

let counter = 0;
const newId = () => `local-${Date.now()}-${counter++}`;

export default function KallyScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  if (user) return <Kally />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + space.lg, paddingHorizontal: space.lg }}>
      <EnvironmentHeader title="Kally" />
      <StateView empty="Entre com sua conta para conversar com a Kally. As conversas ficam salvas só para você, neste ambiente." />
      <Button label="Entrar" onPress={() => router.push("/login")} />
    </View>
  );
}

function Kally() {
  const insets = useSafeAreaInsets();
  const { api, environment, permissions } = useCurrentEnvironment();
  const [mode, setMode] = useState<KallyMode>("chat");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [transcribed, setTranscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<KallyConversation[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const list = useRef<FlatList<Message>>(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistory((await api.kallyConversations()).conversations);
    } catch {
      setHistory([]);
    }
  }, [api]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  function startNew(nextMode: KallyMode = mode) {
    if (loading) return;
    setMode(nextMode);
    setConversationId(null);
    setMessages([]);
    setDraft("");
    setTranscribed(false);
  }

  async function resume(conversation: KallyConversation) {
    setShowHistory(false);
    try {
      const full = await api.kallyConversation(conversation.id);
      setMode(full.mode);
      setConversationId(full.id);
      setMessages(full.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, sources: m.sources })));
    } catch (cause) {
      Alert.alert("Kally", cause instanceof Error ? cause.message : "Não consegui abrir a conversa.");
    }
  }

  function remove(conversation: KallyConversation) {
    Alert.alert("Apagar conversa?", conversation.title, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar",
        style: "destructive",
        onPress: async () => {
          await api.deleteKallyConversation(conversation.id).catch(() => undefined);
          if (conversation.id === conversationId) startNew();
          void loadHistory();
        },
      },
    ]);
  }

  async function send(raw: string) {
    const content = raw.trim();
    if (!content || loading) return;
    const user: Message = { id: newId(), role: "user", content };
    const assistant: Message = { id: newId(), role: "assistant", content: "" };
    setMessages((current) => [...current, user, assistant]);
    setDraft("");
    setTranscribed(false);
    setLoading(true);
    const update = (change: (m: Message) => Message) => setMessages((current) => current.map((m) => (m.id === assistant.id ? change(m) : m)));
    try {
      await streamEvents(api.kallyPath, { message: content, conversationId, mode }, (event) => {
        if (event.conversationId) setConversationId(event.conversationId);
        if (event.sources) update((m) => ({ ...m, sources: event.sources?.map(({ title, slug }) => ({ title, slug })) }));
        if (event.text) update((m) => ({ ...m, content: m.content + event.text }));
      });
    } catch (cause) {
      update((m) => ({ ...m, content: m.content || (cause instanceof Error ? cause.message : "Falha ao conversar com a Kally."), sources: m.content ? m.sources : [] }));
    } finally {
      setLoading(false);
      void loadHistory();
    }
  }

  const canIdea = permissions.publish;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <View style={{ flex: 1 }}>
          <EnvironmentHeader title="Kally" subtitle={mode === "ideia" ? "Transformar uma ideia em pensamento" : "Conversa sobre os pensamentos deste ambiente"} />
        </View>
        <IconButton name="clock" label="Conversas" onPress={() => { setShowHistory(true); void loadHistory(); }} />
        {messages.length ? <IconButton name="plus" label="Nova conversa" onPress={() => startNew()} /> : null}
      </View>

      {canIdea ? (
        <View style={styles.modes}>
          <Chip label="Perguntar" selected={mode === "chat"} onPress={() => mode !== "chat" && startNew("chat")} />
          <Chip label="Transformar ideia" selected={mode === "ideia"} onPress={() => mode !== "ideia" && startNew("ideia")} />
        </View>
      ) : null}

      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: space.lg, gap: space.lg, flexGrow: 1 }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.badge}><Icon name="sparkle" size={22} color={colors.violet300} /></View>
            <AppText variant="title" style={{ textAlign: "center", marginTop: space.md }}>
              {mode === "ideia" ? "Qual ideia você quer desenvolver?" : `O que você quer entender em ${environment.name}?`}
            </AppText>
            <AppText color={colors.muted} style={{ textAlign: "center", marginTop: space.sm }}>
              {mode === "ideia"
                ? "Escreva ou fale. A Kally organiza seus argumentos, pergunta o que faltar e monta um rascunho na sua voz."
                : "A Kally responde a partir dos pensamentos deste ambiente e mostra quais usou."}
            </AppText>
            <View style={{ gap: space.sm, marginTop: space.xl, alignItems: "center" }}>
              {suggestions[mode].map((s) => <Chip key={s} label={s} onPress={() => (mode === "ideia" ? setDraft(s) : void send(s))} />)}
            </View>
          </View>
        }
        renderItem={({ item }) => <Bubble item={item} mode={mode} canSendToEditor={canIdea} pending={loading && item === messages.at(-1)} />}
      />

      {transcribed ? <AppText variant="small" color={colors.warning} style={{ paddingHorizontal: space.lg }}>Transcrição do áudio: revise e edite antes de enviar.</AppText> : null}
      <View style={[styles.composer, { paddingBottom: space.md }]}>
        {mode === "ideia" ? (
          <VoiceButton
            transcribe={api.transcribe}
            disabled={loading}
            onText={(text) => {
              setDraft((current) => (current.trim() ? `${current.trim()}\n\n${text}` : text));
              setTranscribed(true);
            }}
          />
        ) : null}
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={mode === "ideia" ? "Descreva sua ideia…" : "Pergunte à Kally…"}
          placeholderTextColor={colors.faint}
          selectionColor={colors.violet400}
          maxLength={4000}
          multiline
          editable={!loading}
          style={styles.input}
        />
        <Touchable
          accessibilityRole="button"
          accessibilityLabel="Enviar"
          disabled={loading || !draft.trim()}
          onPress={() => void send(draft)}
          style={[styles.send, (loading || !draft.trim()) && { opacity: 0.4 }]}
        >
          <Icon name="send" size={20} color="#FFFFFF" strokeWidth={2} />
        </Touchable>
      </View>

      <Modal visible={showHistory} transparent animationType="fade" onRequestClose={() => setShowHistory(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowHistory(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
            <AppText variant="title">Conversas</AppText>
            <AppText variant="small" color={colors.faint} style={{ marginBottom: space.md }}>Só suas, só deste ambiente.</AppText>
            {!history ? (
              <StateView loading />
            ) : !history.length ? (
              <StateView empty="Nenhuma conversa ainda." />
            ) : (
              <FlatList
                data={history}
                keyExtractor={(c) => c.id}
                style={{ maxHeight: 420 }}
                renderItem={({ item }) => (
                  <View style={styles.row}>
                    <Touchable style={{ flex: 1 }} onPress={() => void resume(item)}>
                      <AppText numberOfLines={1} color={item.id === conversationId ? colors.violet300 : colors.text}>{item.title}</AppText>
                      <AppText variant="small" color={colors.faint}>{item.mode === "ideia" ? "Ideia" : "Pergunta"} · {formatDateShort(item.updatedAt)}</AppText>
                    </Touchable>
                    <IconButton name="trash" label="Apagar conversa" color={colors.muted} onPress={() => remove(item)} />
                  </View>
                )}
              />
            )}
            <Button label="Nova conversa" icon="plus" variant="secondary" onPress={() => { setShowHistory(false); startNew(); }} style={{ marginTop: space.md }} />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Bubble({ item, mode, canSendToEditor, pending }: { item: Message; mode: KallyMode; canSendToEditor: boolean; pending: boolean }) {
  const isUser = item.role === "user";
  const { before, draft, after } = isUser ? { before: item.content, draft: null, after: "" } : extractDraft(item.content);
  return (
    <View style={[styles.bubble, isUser ? styles.user : styles.assistant]}>
      <AppText variant="label" color={isUser ? colors.violet300 : colors.faint} style={{ marginBottom: space.xs }}>{isUser ? "Você" : "Kally"}</AppText>
      {!item.content ? (
        <AppText variant="small" color={colors.muted}>Lendo os pensamentos…</AppText>
      ) : isUser ? (
        <AppText>{item.content}</AppText>
      ) : (
        <>
          {before ? <Markdown>{before}</Markdown> : null}
          {draft ? (
            <View style={styles.draft}>
              <AppText variant="label" color={colors.violet300}>Rascunho</AppText>
              {draft.title ? <AppText variant="uiMedium" style={{ marginTop: space.xs }}>{draft.title}</AppText> : null}
              <AppText variant="small" color={colors.muted} numberOfLines={6} style={{ marginTop: space.xs }}>{draft.content}</AppText>
              {canSendToEditor && !pending ? (
                <Button
                  label="Abrir no editor"
                  icon="edit"
                  compact
                  onPress={() => {
                    handOffDraft(draft);
                    router.push({ pathname: "/editor/[id]", params: { id: "novo" } });
                  }}
                  style={{ marginTop: space.md }}
                />
              ) : null}
            </View>
          ) : null}
          {after ? <Markdown>{after}</Markdown> : null}
        </>
      )}
      {item.sources?.length ? (
        <View style={styles.sources}>
          <AppText variant="label" color={colors.faint}>{mode === "ideia" ? "Pensamentos relacionados" : "Pensamentos usados"}</AppText>
          {item.sources.map((source) => (
            <Touchable key={source.slug} onPress={() => router.push({ pathname: "/post/[slug]", params: { slug: source.slug } })}>
              <AppText variant="small" color={colors.violet300}>{source.title}</AppText>
            </Touchable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.lg, paddingBottom: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  modes: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: space.xxxl },
  badge: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.violet950, borderWidth: 1, borderColor: colors.violet800 },
  bubble: { borderRadius: radius.lg, padding: space.md, borderWidth: 1 },
  user: { alignSelf: "flex-end", maxWidth: "88%", backgroundColor: colors.violet950, borderColor: colors.violet800 },
  assistant: { backgroundColor: colors.surface, borderColor: colors.line },
  draft: { marginTop: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.violet800, backgroundColor: colors.surfaceRaised },
  sources: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, gap: space.xs },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  input: { ...type.ui, flex: 1, color: colors.text, maxHeight: 140, minHeight: 44, paddingHorizontal: space.md, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface },
  send: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.violet600, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
});
