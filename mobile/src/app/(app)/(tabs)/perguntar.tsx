import { useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { streamEvents, type StreamEvent } from "@/lib/stream";
import { Markdown } from "@/components/markdown/markdown";
import { EnvironmentHeader } from "@/components/environment-header";
import { useCurrentEnvironment } from "@/lib/environment";
import { AppText, Chip, IconButton, StateView, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { colors, radius, space, type } from "@/theme/tokens";

/** Mesmo chat da página /conversar: respostas baseadas nos pensamentos publicados. */

type Message = { id: string; role: "user" | "assistant"; content: string; sources?: NonNullable<StreamEvent["sources"]> };

const suggestions = [
  "O que Kayk escreveu sobre identidade?",
  "Quais pensamentos falam sobre relações?",
  "Como o espetáculo muda nosso comportamento?",
];

let counter = 0;
const newId = () => `${Date.now()}-${counter++}`;

/** O chat usa a IA, que não foi alterada nesta etapa: ele lê só o ambiente original. */
export default function AskScreen() {
  const { environment } = useCurrentEnvironment();
  const insets = useSafeAreaInsets();
  if (environment.id === "mente") return <Chat />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + space.lg, paddingHorizontal: space.lg }}>
      <EnvironmentHeader title="Perguntar" />
      <StateView empty={`O assistente de perguntas ainda responde apenas sobre o ambiente Minha Mente. Em ${environment.name}, use a busca para encontrar pensamentos.`} />
    </View>
  );
}

function Chat() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const list = useRef<FlatList<Message>>(null);

  async function send(raw: string) {
    const content = raw.trim();
    if (!content || loading) return;
    const user: Message = { id: newId(), role: "user", content };
    const assistant: Message = { id: newId(), role: "assistant", content: "" };
    // O backend aceita até 8 mensagens: 7 anteriores + a nova (como no site).
    const history = messages.slice(-7).map(({ role, content: c }) => ({ role, content: c }));
    setMessages((current) => [...current, user, assistant]);
    setDraft("");
    setLoading(true);
    const update = (change: (m: Message) => Message) =>
      setMessages((current) => current.map((m) => (m.id === assistant.id ? change(m) : m)));
    try {
      await streamEvents("/api/chat", { messages: [...history, { role: "user", content }] }, (event) => {
        if (event.text) update((m) => ({ ...m, content: m.content + event.text }));
        if (event.sources) update((m) => ({ ...m, sources: event.sources }));
      });
    } catch (cause) {
      update((m) => ({ ...m, content: cause instanceof Error ? cause.message : "Falha ao conversar com o assistente.", sources: [] }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <View style={{ flex: 1 }}>
          <AppText variant="label" color={colors.violet300}>Arquivo de pensamentos · Ollama</AppText>
          <AppText variant="title" style={{ marginTop: 2 }}>Perguntar ao arquivo</AppText>
        </View>
        {messages.length ? <IconButton name="close" label="Nova conversa" onPress={() => !loading && setMessages([])} /> : null}
      </View>

      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: space.lg, gap: space.lg, flexGrow: 1 }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.empty}>
            <AppText variant="title" style={{ textAlign: "center" }}>O que você quer descobrir?</AppText>
            <AppText color={colors.muted} style={{ textAlign: "center", marginTop: space.sm }}>Pergunte sobre um tema, uma ideia ou o que Kayk já escreveu.</AppText>
            <View style={{ gap: space.sm, marginTop: space.xl, alignItems: "center" }}>
              {suggestions.map((s) => <Chip key={s} label={s} onPress={() => void send(s)} />)}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === "user" ? styles.user : styles.assistant]}>
            <AppText variant="label" color={item.role === "user" ? colors.violet300 : colors.faint} style={{ marginBottom: space.xs }}>
              {item.role === "user" ? "Você" : "Assistente"}
            </AppText>
            {item.content ? (
              item.role === "user" ? <AppText>{item.content}</AppText> : <Markdown>{item.content}</Markdown>
            ) : (
              <AppText variant="small" color={colors.muted}>Lendo os pensamentos…</AppText>
            )}
            {item.sources?.length ? (
              <View style={styles.sources}>
                <AppText variant="label" color={colors.faint}>Pensamentos relacionados</AppText>
                {item.sources.map((source) => (
                  <Touchable key={source.slug} onPress={() => router.push({ pathname: "/post/[slug]", params: { slug: source.slug } })}>
                    <AppText variant="small" color={colors.violet300}>{source.title}</AppText>
                  </Touchable>
                ))}
              </View>
            ) : null}
          </View>
        )}
      />

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Escreva sua pergunta…"
          placeholderTextColor={colors.faint}
          selectionColor={colors.violet400}
          maxLength={1200}
          multiline
          editable={!loading}
          style={styles.input}
        />
        <Touchable
          accessibilityRole="button"
          accessibilityLabel="Enviar pergunta"
          disabled={loading || !draft.trim()}
          onPress={() => void send(draft)}
          style={[styles.send, (loading || !draft.trim()) && { opacity: 0.4 }]}
        >
          <Icon name="send" size={20} color="#FFFFFF" strokeWidth={2} />
        </Touchable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingBottom: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  empty: { flex: 1, justifyContent: "center", paddingVertical: space.xxxl },
  bubble: { borderRadius: radius.lg, padding: space.md, borderWidth: 1 },
  user: { alignSelf: "flex-end", maxWidth: "88%", backgroundColor: colors.violet950, borderColor: colors.violet800 },
  assistant: { backgroundColor: colors.surface, borderColor: colors.line },
  sources: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, gap: space.xs },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, padding: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  input: { ...type.ui, flex: 1, color: colors.text, maxHeight: 120, minHeight: 44, paddingHorizontal: space.md, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface },
  send: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.violet600, alignItems: "center", justifyContent: "center" },
});
