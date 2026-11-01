import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { streamEvents } from "@/lib/stream";
import { useAuth } from "@/lib/auth";
import { useCurrentEnvironment } from "@/lib/environment";
import { applySuggestions, extractDraft, handOffDraft } from "@/lib/draft-handoff";
import { formatDateShort } from "@/lib/format";
import { pickImage, uploadablePart } from "@/lib/upload";
import type { KallyAttachment, KallyConversation, KallyImage, KallyMode, KallyReview, KallySource } from "@/lib/types";
import { Markdown } from "@/components/markdown/markdown";
import { EnvironmentHeader } from "@/components/environment-header";
import { VoiceButton } from "@/components/voice-button";
import { AppText, Button, Chip, IconButton, StateView, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { colors, radius, space, type } from "@/theme/tokens";

/**
 * Kally: assistente de aprendizagem do ambiente atual, numa tela só para conversar,
 * desenvolver ideias, revisar, aprender e pesquisar. Conversas são temporárias por
 * padrão (nada fica no servidor); a pessoa escolhe salvar ao começar.
 */

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: KallySource[];
  review?: KallyReview;
  /** texto colado para revisão (para aplicar as sugestões sem um post) */
  reviewSource?: string;
  attachmentName?: string;
};
type ReviewKind = "textual" | "intelectual";

const MODES: { mode: KallyMode; label: string; needsPublish?: boolean }[] = [
  { mode: "chat", label: "Conversar" },
  { mode: "ideia", label: "Ideia", needsPublish: true },
  { mode: "revisar", label: "Revisar" },
  { mode: "aprender", label: "Aprender" },
];

const intro: Record<KallyMode, { title: (env: string) => string; text: string; suggestions: string[] }> = {
  chat: {
    title: (env) => `Oi! O que vamos explorar em ${env}?`,
    text: "Pergunte sobre os pensamentos do ambiente, peça para relacionar ideias ou só converse. Com a web ligada, a Kally completa com fontes externas.",
    suggestions: ["Quais temas aparecem mais aqui?", "Que relações existem entre os pensamentos?", "Me conta uma curiosidade"],
  },
  ideia: {
    title: () => "Qual ideia você quer desenvolver?",
    text: "Escreva ou fale. A Kally pergunta aos poucos, sugere títulos, pastas e pensamentos relacionados, e monta o rascunho na sua voz.",
    suggestions: ["Tenho uma ideia, mas ainda está confusa…", "Quero escrever sobre algo que vivi hoje"],
  },
  revisar: {
    title: () => "O que você quer revisar?",
    text: "Escolha um pensamento seu ou cole um texto. Revisão textual sugere trocas que você aprova; a intelectual questiona argumentos e conceitos.",
    suggestions: [],
  },
  aprender: {
    title: () => "O que você quer aprender?",
    text: "A Kally parte do que o ambiente já tem, monta uma sequência de etapas e confere sua compreensão com perguntas.",
    suggestions: ["Quero aprender sobre redes de computadores", "Me ensine o tema mais presente aqui"],
  },
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
      <StateView empty="Entre com sua conta para conversar com a Kally." />
      <Button label="Entrar" onPress={() => router.push("/login")} />
    </View>
  );
}

function Kally() {
  const insets = useSafeAreaInsets();
  const { api, environment, permissions } = useCurrentEnvironment();
  const [mode, setMode] = useState<KallyMode>("chat");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [save, setSave] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [transcribed, setTranscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [web, setWeb] = useState(false);
  const [attachment, setAttachment] = useState<KallyAttachment | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [reviewKind, setReviewKind] = useState<ReviewKind>("textual");
  const [reviewTarget, setReviewTarget] = useState<{ id: string; title: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [history, setHistory] = useState<KallyConversation[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const list = useRef<FlatList<Message>>(null);
  const started = messages.length > 0;

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
    setAttachment(null);
    setReviewTarget(null);
  }

  async function resume(conversation: KallyConversation) {
    setShowHistory(false);
    try {
      const full = await api.kallyConversation(conversation.id);
      setMode(full.mode);
      setConversationId(full.id);
      setSave(true);
      setMessages(full.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, sources: m.sources })));
    } catch (cause) {
      Alert.alert("Kally", cause instanceof Error ? cause.message : "Não consegui abrir a conversa.");
    }
  }

  function remove(conversation: KallyConversation) {
    const confirmDelete = async () => {
      await api.deleteKallyConversation(conversation.id).catch(() => undefined);
      if (conversation.id === conversationId) startNew();
      void loadHistory();
    };
    // Na web o Alert do React Native não aparece: usa a confirmação do navegador.
    if (Platform.OS === "web") {
      if (window.confirm(`Apagar a conversa "${conversation.title}"?`)) void confirmDelete();
      return;
    }
    Alert.alert("Apagar conversa?", conversation.title, [
      { text: "Cancelar", style: "cancel" },
      { text: "Apagar", style: "destructive", onPress: () => void confirmDelete() },
    ]);
  }

  async function uploadAttachment(part: Blob, name: string) {
    setAttaching(true);
    try {
      const form = new FormData();
      form.append("file", part, name);
      setAttachment(await api.kallyAttachment(form));
    } catch (cause) {
      Alert.alert("Anexo", cause instanceof Error ? cause.message : "Não consegui ler o anexo.");
    } finally {
      setAttaching(false);
    }
  }

  async function pickDocument() {
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    const part = Platform.OS === "web" ? (asset.file ?? (await (await fetch(asset.uri)).blob())) : (new File(asset.uri) as unknown as Blob);
    await uploadAttachment(part, asset.name);
  }

  function attach() {
    if (Platform.OS === "web") return void pickDocument();
    Alert.alert("Anexar", "PDFs viram texto; imagens são descritas pela Kally. Nada fica guardado.", [
      { text: "Foto", onPress: () => void pickImage().then(async (asset) => { if (asset) { const { part, name } = await uploadablePart(asset); await uploadAttachment(part, name); } }).catch((e) => Alert.alert("Anexo", e instanceof Error ? e.message : "Erro")) },
      { text: "PDF ou arquivo", onPress: () => void pickDocument() },
      { text: "Cancelar", style: "cancel" },
    ]);
  }

  async function send(raw: string) {
    let content = raw.trim();
    const firstReview = mode === "revisar" && !started;
    if (firstReview && !reviewTarget && !content) return;
    if (!firstReview && !content) return;
    if (loading) return;
    if (firstReview) content = `${reviewKind === "textual" ? "Revisão textual" : "Revisão intelectual"} de ${reviewTarget ? `"${reviewTarget.title}"` : "um texto colado"}`;

    const user: Message = { id: newId(), role: "user", content, attachmentName: attachment?.name, reviewSource: firstReview && !reviewTarget ? raw.trim() : undefined };
    const assistant: Message = { id: newId(), role: "assistant", content: "", reviewSource: user.reviewSource };
    // Temporária: o app manda o histórico (o servidor não guarda nada).
    const temporaryHistory = conversationId ? undefined : messages.slice(-10).map(({ role, content: c }) => ({ role, content: c }));
    setMessages((current) => [...current, user, assistant]);
    setDraft("");
    setTranscribed(false);
    setLoading(true);
    const update = (change: (m: Message) => Message) => setMessages((current) => current.map((m) => (m.id === assistant.id ? change(m) : m)));
    const payload = {
      message: content,
      mode,
      conversationId,
      save: !conversationId && save,
      history: temporaryHistory,
      web,
      attachment: attachment ? { name: attachment.name, kind: attachment.kind, text: attachment.text } : undefined,
      review: firstReview ? { kind: reviewKind, ...(reviewTarget ? { postId: reviewTarget.id } : { text: raw.trim() }) } : undefined,
    };
    setAttachment(null);
    try {
      await streamEvents(api.kallyPath, payload, (event) => {
        if (event.conversationId) setConversationId(event.conversationId);
        if (event.sources) update((m) => ({ ...m, sources: event.sources as KallySource[] }));
        if (event.review) update((m) => ({ ...m, review: event.review as KallyReview }));
        if (event.text) update((m) => ({ ...m, content: m.content + event.text }));
      });
    } catch (cause) {
      update((m) => ({ ...m, content: m.content || (cause instanceof Error ? cause.message : "Falha ao conversar com a Kally."), sources: m.content ? m.sources : [] }));
    } finally {
      setLoading(false);
      if (save || conversationId) void loadHistory();
    }
  }

  const canIdea = permissions.publish;
  const info = intro[mode];
  const reviewReady = mode === "revisar" && !started;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <View style={{ flex: 1 }}>
          <EnvironmentHeader title="Kally" subtitle={started ? (conversationId ? "Conversa salva" : "Conversa temporária") : "Sua assistente neste ambiente"} />
        </View>
        <IconButton name="clock" label="Conversas salvas" onPress={() => { setShowHistory(true); void loadHistory(); }} />
        {started ? <IconButton name="plus" label="Nova conversa" onPress={() => startNew()} /> : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modes} style={{ flexGrow: 0 }}>
        {MODES.filter((m) => !m.needsPublish || canIdea).map((m) => (
          <Chip key={m.mode} label={m.label} selected={mode === m.mode} onPress={() => mode !== m.mode && startNew(m.mode)} />
        ))}
      </ScrollView>

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
            <AppText variant="title" style={{ textAlign: "center", marginTop: space.md }}>{info.title(environment.name)}</AppText>
            <AppText color={colors.muted} style={{ textAlign: "center", marginTop: space.sm }}>{info.text}</AppText>

            {mode === "revisar" ? (
              <View style={{ gap: space.sm, marginTop: space.xl, alignSelf: "stretch" }}>
                <View style={styles.row2}>
                  <Chip label="Textual" selected={reviewKind === "textual"} onPress={() => setReviewKind("textual")} />
                  <Chip label="Intelectual" selected={reviewKind === "intelectual"} onPress={() => setReviewKind("intelectual")} />
                </View>
                <Button label={reviewTarget ? `Revisar "${reviewTarget.title}"` : "Escolher um pensamento"} icon="doc" variant="secondary" onPress={() => setPicking(true)} />
                <AppText variant="small" color={colors.faint} style={{ textAlign: "center" }}>…ou cole o texto abaixo e envie.</AppText>
              </View>
            ) : (
              <View style={{ gap: space.sm, marginTop: space.xl, alignItems: "center" }}>
                {info.suggestions.map((s) => <Chip key={s} label={s} onPress={() => (mode === "ideia" ? setDraft(s) : void send(s))} />)}
              </View>
            )}

            <Touchable onPress={() => setSave((v) => !v)} style={styles.saveToggle} accessibilityRole="switch" accessibilityState={{ checked: save }}>
              <View style={[styles.check, save && styles.checkOn]}>{save ? <Icon name="check" size={14} color="#FFFFFF" strokeWidth={2.4} /> : null}</View>
              <View style={{ flex: 1 }}>
                <AppText variant="uiMedium">Salvar esta conversa</AppText>
                <AppText variant="small" color={colors.faint}>{save ? "Fica no seu histórico deste ambiente (só você vê)." : "Temporária: nada fica guardado quando você sair."}</AppText>
              </View>
            </Touchable>
          </View>
        }
        renderItem={({ item }) => <Bubble item={item} mode={mode} pending={loading && item === messages.at(-1)} />}
      />

      {transcribed ? <AppText variant="small" color={colors.warning} style={styles.note}>Transcrição do áudio: revise e edite antes de enviar.</AppText> : null}
      {attachment || attaching ? (
        <View style={styles.attachment}>
          {attaching ? <ActivityIndicator color={colors.violet300} /> : <Icon name={attachment?.kind === "pdf" ? "doc" : "image"} size={16} color={colors.violet300} />}
          <AppText variant="small" numberOfLines={1} style={{ flex: 1 }}>
            {attaching ? "Lendo o anexo…" : `${attachment!.name} · ${attachment!.kind === "pdf" ? `${attachment!.pages ?? "?"} pág.` : "imagem descrita"}${attachment!.truncated ? " (parcial)" : ""}`}
          </AppText>
          {attachment ? <IconButton name="close" label="Remover anexo" color={colors.muted} onPress={() => setAttachment(null)} /> : null}
        </View>
      ) : null}

      <View style={styles.tools}>
        <Touchable onPress={() => setWeb((v) => !v)} style={[styles.tool, web && styles.toolOn]} accessibilityRole="switch" accessibilityState={{ checked: web }} accessibilityLabel="Permitir pesquisa na internet">
          <Icon name="globe" size={16} color={web ? colors.violet200 : colors.muted} />
          <AppText variant="small" color={web ? colors.violet200 : colors.muted}>Web</AppText>
        </Touchable>
        <Touchable onPress={attach} disabled={attaching || loading} style={styles.tool} accessibilityLabel="Anexar PDF ou imagem">
          <Icon name="clip" size={16} color={colors.muted} />
          <AppText variant="small" color={colors.muted}>Anexo</AppText>
        </Touchable>
        {reviewReady && reviewTarget ? <AppText variant="small" color={colors.violet300} numberOfLines={1} style={{ flex: 1 }}>Revisando “{reviewTarget.title}”</AppText> : null}
      </View>

      <View style={[styles.composer, { paddingBottom: space.md }]}>
        {mode === "ideia" || mode === "chat" ? (
          <VoiceButton
            transcribe={api.transcribe}
            disabled={loading || !permissions.publish}
            onText={(text) => {
              setDraft((current) => (current.trim() ? `${current.trim()}\n\n${text}` : text));
              setTranscribed(true);
            }}
          />
        ) : null}
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={reviewReady ? (reviewTarget ? "Algum foco? (opcional)" : "Cole o texto para revisar…") : mode === "ideia" ? "Descreva sua ideia…" : mode === "aprender" ? "O que você quer aprender?" : "Fale com a Kally…"}
          placeholderTextColor={colors.faint}
          selectionColor={colors.violet400}
          maxLength={reviewReady && !reviewTarget ? 20000 : 4000}
          multiline
          editable={!loading}
          style={styles.input}
        />
        <Touchable
          accessibilityRole="button"
          accessibilityLabel="Enviar"
          disabled={loading || (!draft.trim() && !(reviewReady && reviewTarget))}
          onPress={() => void send(draft)}
          style={[styles.send, (loading || (!draft.trim() && !(reviewReady && reviewTarget))) && { opacity: 0.4 }]}
        >
          <Icon name="send" size={20} color="#FFFFFF" strokeWidth={2} />
        </Touchable>
      </View>

      <PostPicker visible={picking} onClose={() => setPicking(false)} onPick={(post) => { setReviewTarget(post); setPicking(false); }} />

      <Modal visible={showHistory} transparent animationType="fade" onRequestClose={() => setShowHistory(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowHistory(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
            <AppText variant="title">Conversas salvas</AppText>
            <AppText variant="small" color={colors.faint} style={{ marginBottom: space.md }}>Só suas, só deste ambiente. As temporárias não aparecem aqui.</AppText>
            {!history ? (
              <StateView loading />
            ) : !history.length ? (
              <StateView empty="Nenhuma conversa salva ainda." />
            ) : (
              <FlatList
                data={history}
                keyExtractor={(c) => c.id}
                style={{ maxHeight: 420 }}
                renderItem={({ item }) => (
                  <View style={styles.row}>
                    <Touchable style={{ flex: 1 }} onPress={() => void resume(item)}>
                      <AppText numberOfLines={1} color={item.id === conversationId ? colors.violet300 : colors.text}>{item.title}</AppText>
                      <AppText variant="small" color={colors.faint}>{MODES.find((m) => m.mode === item.mode)?.label ?? "Conversa"} · {formatDateShort(item.updatedAt)}</AppText>
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

/** Pensamentos que a pessoa pode editar (os próprios, ou todos para quem gerencia). */
function PostPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (post: { id: string; title: string }) => void }) {
  const { api } = useCurrentEnvironment();
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<{ id: string; title: string; status: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    api.managePosts().then((page) => setPosts(page.posts), (cause) => setError(cause instanceof Error ? cause.message : "Não consegui listar seus pensamentos."));
  }, [visible, api]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <AppText variant="title" style={{ marginBottom: space.md }}>Qual pensamento revisar?</AppText>
          {error ? <StateView error={error} /> : !posts ? <StateView loading /> : !posts.length ? <StateView empty="Você ainda não tem pensamentos para revisar aqui." /> : (
            <FlatList
              data={posts}
              keyExtractor={(p) => p.id}
              style={{ maxHeight: 440 }}
              renderItem={({ item }) => (
                <Touchable style={styles.row} onPress={() => onPick(item)}>
                  <AppText numberOfLines={1} style={{ flex: 1 }}>{item.title}</AppText>
                  <AppText variant="small" color={colors.faint}>{item.status === "DRAFT" ? "Rascunho" : item.status === "SCHEDULED" ? "Agendado" : "Publicado"}</AppText>
                </Touchable>
              )}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Bubble({ item, mode, pending }: { item: Message; mode: KallyMode; pending: boolean }) {
  const isUser = item.role === "user";
  const { before, draft, after } = isUser ? { before: item.content, draft: null, after: "" } : extractDraft(item.content);
  const internal = item.sources?.filter((s) => s.kind !== "web") ?? [];
  const external = item.sources?.filter((s) => s.kind === "web") ?? [];
  return (
    <View style={[styles.bubble, isUser ? styles.user : styles.assistant]}>
      <AppText variant="label" color={isUser ? colors.violet300 : colors.faint} style={{ marginBottom: space.xs }}>{isUser ? "Você" : "Kally"}</AppText>
      {item.attachmentName ? <AppText variant="small" color={colors.violet300} style={{ marginBottom: space.xs }}>📎 {item.attachmentName}</AppText> : null}
      {!item.content ? (
        <AppText variant="small" color={colors.muted}>{mode === "revisar" ? "Revisando…" : "Pensando…"}</AppText>
      ) : isUser ? (
        <AppText>{item.content}</AppText>
      ) : (
        <>
          {before ? <Markdown>{before}</Markdown> : null}
          {draft ? <DraftCard draft={draft} pending={pending} /> : null}
          {after ? <Markdown>{after}</Markdown> : null}
        </>
      )}
      {item.review ? <ReviewCard review={item.review} source={item.reviewSource} /> : null}
      {internal.length ? (
        <View style={styles.sources}>
          <AppText variant="label" color={colors.faint}>Do ambiente</AppText>
          {internal.map((source) => (
            <Touchable key={`${source.kind}-${source.slug}`} disabled={source.kind === "conversa" || source.kind === "rascunho"} onPress={() => router.push({ pathname: "/post/[slug]", params: { slug: source.slug } })}>
              <AppText variant="small" color={source.kind === "conversa" || source.kind === "rascunho" ? colors.muted : colors.violet300}>
                {source.title}
                {source.kind === "projeto" ? " · projeto" : source.kind === "rascunho" ? " · rascunho" : source.kind === "conversa" ? " · conversa anterior" : ""}
              </AppText>
            </Touchable>
          ))}
        </View>
      ) : null}
      {external.length ? (
        <View style={styles.sources}>
          <AppText variant="label" color={colors.faint}>Fontes externas</AppText>
          {external.map((source) => (
            <Touchable key={source.slug} onPress={() => source.url && void Linking.openURL(source.url)} style={styles.link}>
              <Icon name="globe" size={12} color={colors.violet300} />
              <AppText variant="small" color={colors.violet300} style={{ flex: 1 }}>{source.title}</AppText>
            </Touchable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Rascunho pronto: a Kally cria o pensamento (rascunho), ou leva ao editor. Imagens só com aprovação. */
function DraftCard({ draft, pending }: { draft: { title: string; content: string; categories: string[] }; pending: boolean }) {
  const { api, permissions } = useCurrentEnvironment();
  const [content, setContent] = useState(draft.content);
  const [creating, setCreating] = useState(false);
  const [images, setImages] = useState(false);
  useEffect(() => setContent(draft.content), [draft.content]);
  const value = { title: draft.title, content };

  async function create() {
    setCreating(true);
    try {
      const created = await api.kallyCreateDraft({ ...value, categories: draft.categories });
      router.push({ pathname: "/editor/[id]", params: { id: created.id } });
    } catch (cause) {
      Alert.alert("Rascunho", cause instanceof Error ? cause.message : "Não consegui criar o rascunho.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <View style={styles.card}>
      <AppText variant="label" color={colors.violet300}>Rascunho</AppText>
      {draft.title ? <AppText variant="uiMedium" style={{ marginTop: space.xs }}>{draft.title}</AppText> : null}
      {draft.categories.length ? <AppText variant="small" color={colors.faint}>Pastas sugeridas: {draft.categories.join(", ")}</AppText> : null}
      <AppText variant="small" color={colors.muted} numberOfLines={8} style={{ marginTop: space.xs }}>{content}</AppText>
      {permissions.publish && !pending ? (
        <View style={styles.actions}>
          <Button label="Criar rascunho" icon="check" compact loading={creating} onPress={() => void create()} />
          <Button label="Abrir no editor" icon="edit" variant="secondary" compact onPress={() => { handOffDraft(value); router.push({ pathname: "/editor/[id]", params: { id: "novo" } }); }} />
          <Button label="Imagens" icon="image" variant="ghost" compact onPress={() => setImages(true)} />
        </View>
      ) : null}
      <ImagePickerSheet visible={images} query={draft.title} onClose={() => setImages(false)} onInsert={(markdown) => { setContent((c) => `${c.trim()}\n\n${markdown}`); setImages(false); }} />
    </View>
  );
}

/** Imagens livres sugeridas: a pessoa vê, escolhe e confirma; só então a imagem entra no rascunho. */
function ImagePickerSheet({ visible, query, onClose, onInsert }: { visible: boolean; query: string; onClose: () => void; onInsert: (markdown: string) => void }) {
  const { api } = useCurrentEnvironment();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState(query);
  const [results, setResults] = useState<KallyImage[] | null>(null);
  const [chosen, setChosen] = useState<KallyImage | null>(null);
  const [busy, setBusy] = useState(false);
  const search = useCallback(async (term: string) => {
    setResults(null);
    try {
      setResults((await api.kallyImages(term)).images);
    } catch {
      setResults([]);
    }
  }, [api]);
  useEffect(() => {
    if (visible) void search(query);
  }, [visible, query, search]);

  async function insert() {
    if (!chosen) return;
    setBusy(true);
    try {
      onInsert((await api.kallyImportImage(chosen)).markdown);
      setChosen(null);
    } catch (cause) {
      Alert.alert("Imagem", cause instanceof Error ? cause.message : "Não consegui inserir a imagem.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <AppText variant="title">Imagens para o pensamento</AppText>
          <AppText variant="small" color={colors.faint} style={{ marginBottom: space.sm }}>Livres, do Wikimedia Commons, com crédito. Nada entra sem você confirmar.</AppText>
          <View style={styles.row2}>
            <TextInput value={q} onChangeText={setQ} onSubmitEditing={() => void search(q)} placeholder="Tema da imagem" placeholderTextColor={colors.faint} style={[styles.input, { minHeight: 40 }]} />
            <IconButton name="search" label="Buscar" onPress={() => void search(q)} />
          </View>
          {chosen ? (
            <View style={{ gap: space.sm, marginTop: space.md }}>
              <Image source={{ uri: chosen.thumb }} style={styles.preview} resizeMode="contain" />
              <AppText variant="small" color={colors.muted}>{chosen.title} · {chosen.author} · {chosen.license}</AppText>
              <View style={styles.actions}>
                <Button label="Inserir no rascunho" icon="check" compact loading={busy} onPress={() => void insert()} />
                <Button label="Voltar" variant="secondary" compact onPress={() => setChosen(null)} />
              </View>
            </View>
          ) : !results ? (
            <StateView loading />
          ) : !results.length ? (
            <StateView empty="Nenhuma imagem livre encontrada. Tente outro tema." />
          ) : (
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={styles.grid}>
              {results.map((img) => (
                <Touchable key={img.url} onPress={() => setChosen(img)} style={styles.thumb}>
                  <Image source={{ uri: img.thumb }} style={{ width: "100%", height: "100%" }} />
                </Touchable>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Sugestões da revisão textual: a pessoa marca as que quer e leva ao editor (nada é salvo aqui). */
function ReviewCard({ review, source }: { review: KallyReview; source?: string }) {
  const { api } = useCurrentEnvironment();
  // Nada vem marcado: a pessoa escolhe cada mudança.
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  if (!review.sugestoes.length) return null;
  const toggle = (i: number) => setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));

  async function apply() {
    setBusy(true);
    try {
      const chosen = selected.map((i) => review.sugestoes[i]);
      if (review.postId) {
        const { post } = await api.managedPost(review.postId);
        handOffDraft({ postId: post.id, title: post.title, content: applySuggestions(post.content, chosen) });
        router.push({ pathname: "/editor/[id]", params: { id: post.id } });
      } else if (source) {
        handOffDraft({ title: "", content: applySuggestions(source, chosen) });
        router.push({ pathname: "/editor/[id]", params: { id: "novo" } });
      }
    } catch (cause) {
      Alert.alert("Revisão", cause instanceof Error ? cause.message : "Não consegui aplicar as sugestões.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.card, { gap: space.sm }]}>
      <AppText variant="label" color={colors.violet300}>Sugestões · marque as que quiser aplicar</AppText>
      {review.sugestoes.map((s, i) => (
        <Touchable key={i} onPress={() => s.sugestao && toggle(i)} style={styles.suggestion}>
          <View style={[styles.check, selected.includes(i) && styles.checkOn, !s.sugestao && { opacity: 0.3 }]}>{selected.includes(i) ? <Icon name="check" size={14} color="#FFFFFF" strokeWidth={2.4} /> : null}</View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label" color={colors.faint}>{s.tipo}</AppText>
            <AppText variant="small" color={colors.danger} style={{ textDecorationLine: s.sugestao ? "line-through" : "none" }}>“{s.trecho}”</AppText>
            {s.sugestao ? <AppText variant="small" color={colors.success ?? colors.violet200}>“{s.sugestao}”</AppText> : null}
            <AppText variant="small" color={colors.muted}>{s.motivo}</AppText>
          </View>
        </Touchable>
      ))}
      {review.postId || source ? (
        <Button label={`Aplicar ${selected.length} no editor`} icon="edit" compact disabled={!selected.length} loading={busy} onPress={() => void apply()} />
      ) : null}
      <AppText variant="small" color={colors.faint}>O original só muda se você salvar no editor.</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.lg, paddingBottom: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  modes: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: space.xxl },
  badge: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.violet950, borderWidth: 1, borderColor: colors.violet800 },
  saveToggle: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.xl, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignSelf: "stretch" },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: colors.violet600, borderColor: colors.violet600 },
  bubble: { borderRadius: radius.lg, padding: space.md, borderWidth: 1 },
  user: { alignSelf: "flex-end", maxWidth: "88%", backgroundColor: colors.violet950, borderColor: colors.violet800 },
  assistant: { backgroundColor: colors.surface, borderColor: colors.line },
  card: { marginTop: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.violet800, backgroundColor: colors.surfaceRaised },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  suggestion: { flexDirection: "row", gap: space.sm, paddingVertical: space.xs },
  sources: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, gap: space.xs },
  link: { flexDirection: "row", alignItems: "center", gap: space.xs },
  note: { paddingHorizontal: space.lg },
  attachment: { flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.md, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.violet800, backgroundColor: colors.violet950 },
  tools: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  tool: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.line },
  toolOn: { borderColor: colors.violet600, backgroundColor: colors.violet950 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm },
  input: { ...type.ui, flex: 1, color: colors.text, maxHeight: 140, minHeight: 44, paddingHorizontal: space.md, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface },
  send: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.violet600, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  row2: { flexDirection: "row", alignItems: "center", gap: space.sm, justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  thumb: { width: "31%", aspectRatio: 1, borderRadius: radius.sm, overflow: "hidden", backgroundColor: colors.surface },
  preview: { width: "100%", height: 220, borderRadius: radius.md, backgroundColor: colors.surface },
});
