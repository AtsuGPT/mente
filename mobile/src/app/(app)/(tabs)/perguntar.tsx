import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { streamEvents } from "@/lib/stream";
import { useAuth } from "@/lib/auth";
import { useCurrentEnvironment } from "@/lib/environment";
import { applySuggestions, extractDraft, handOffDraft } from "@/lib/draft-handoff";
import { formatDateShort } from "@/lib/format";
import { pickImage, uploadablePart } from "@/lib/upload";
import { getItem, setItem } from "@/lib/secure-storage";
import type { KallyAttachment, KallyConversation, KallyImage, KallyMode, KallyReview, KallySource } from "@/lib/types";
import { Markdown } from "@/components/markdown/markdown";
import { EnvironmentHeader } from "@/components/environment-header";
import { VoiceButton } from "@/components/voice-button";
import { AmbientGlow } from "@/components/ambient-glow";
import { AppText, Button, Chip, IconButton, StateView, Touchable } from "@/components/ui/primitives";
import { Icon, type IconName } from "@/components/ui/icon";
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
  /** miniatura local da imagem anexada (só nesta sessão) */
  imageUri?: string;
  /** modo que a Kally usou nesta resposta */
  mode?: string;
  failed?: boolean;
  /** aviso do próprio app (ex.: /dev): não vai ao servidor nem ao histórico */
  local?: boolean;
  /** resposta gerada no Modo Desenvolvedor */
  dev?: boolean;
};
type ReviewKind = "textual" | "intelectual";

const MODES: { mode: KallyMode; label: string; hint: string; icon: IconName; needsPublish?: boolean }[] = [
  { mode: "auto", label: "Automático", hint: "A Kally entende o que você quer", icon: "sparkle" },
  { mode: "chat", label: "Conversar", hint: "Papo livre, com o ambiente quando ajudar", icon: "chat" },
  { mode: "ideia", label: "Idealizar", hint: "Desenvolver uma ideia até virar post", icon: "bulb", needsPublish: true },
  { mode: "revisar", label: "Revisar", hint: "Revisão de um texto ou pensamento", icon: "edit" },
  { mode: "aprender", label: "Aprender", hint: "Explicações por etapas, com perguntas", icon: "book" },
];
const modeLabel = (mode?: string) => MODES.find((m) => m.mode === mode)?.label;

type PendingAttachment = { id: number; name: string; localUri?: string; isImage: boolean; status: "processing" | "ready" | "error"; result?: KallyAttachment; error?: string };

const ATTACH_LABEL: Record<KallyAttachment["kind"], string> = { pdf: "PDF", imagem: "imagem descrita", texto: "texto", docx: "Word", csv: "CSV", audio: "áudio transcrito" };

/** Modo Desenvolvedor: personalidade definida pela pessoa, guardada neste aparelho. */
type DevConfig = { active: boolean; persona: DevPersona; instructions: string; vulgar: boolean };
type DevPersona = "livre" | "direta" | "divertida" | "deferente" | "formal";
const DEV_KEY = "minha-mente.kally-dev.v1";
const DEV_OFF: DevConfig = { active: false, persona: "livre", instructions: "", vulgar: false };
const DEV_PERSONAS: { id: DevPersona; label: string }[] = [
  { id: "livre", label: "Só minhas instruções" },
  { id: "direta", label: "Direta" },
  { id: "divertida", label: "Divertida" },
  { id: "deferente", label: "Deferente / obediente" },
  { id: "formal", label: "Formal" },
];

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
  const [mode, setMode] = useState<KallyMode>("auto");
  const [modeMenu, setModeMenu] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [save, setSave] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [transcribed, setTranscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [web, setWeb] = useState(false);
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [queued, setQueued] = useState<string | null>(null);
  const [reviewKind, setReviewKind] = useState<ReviewKind>("intelectual");
  const [reviewTarget, setReviewTarget] = useState<{ id: string; title: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [history, setHistory] = useState<KallyConversation[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [dev, setDevState] = useState<DevConfig>(DEV_OFF);
  const [devSheet, setDevSheet] = useState(false);
  const list = useRef<FlatList<Message>>(null);
  const attachSeq = useRef(0);

  useEffect(() => {
    void getItem(DEV_KEY).then((saved) => {
      if (saved) setDevState({ ...DEV_OFF, ...(JSON.parse(saved) as Partial<DevConfig>) });
    }).catch(() => undefined);
  }, []);
  const setDev = (next: DevConfig) => {
    setDevState(next);
    void setItem(DEV_KEY, JSON.stringify(next)).catch(() => undefined);
  };
  const notice = (content: string) => setMessages((current) => [...current, { id: newId(), role: "assistant", content, local: true }]);

  /** /dev, /dev on, /dev off (ou "padrão"), /dev <instruções>. Tratado aqui; nada vai ao modelo. */
  function devCommand(content: string) {
    const arg = content.replace(/^\/dev\s*/i, "").trim();
    if (/^(off|desligar|padr[aã]o|sair)$/i.test(arg)) {
      setDev({ ...dev, active: false });
      return notice("Modo desenvolvedor **desligado**. Voltei à Kally padrão.");
    }
    if (!arg || /^(on|ligar)$/i.test(arg)) {
      const next = { ...dev, active: arg ? true : !dev.active };
      setDev(next);
      if (next.active && !next.instructions && next.persona === "livre") setDevSheet(true);
      return notice(next.active ? "Modo desenvolvedor **ligado**. Ajuste a personalidade em *Modo ▾ → Modo desenvolvedor* ou com `/dev suas instruções`." : "Modo desenvolvedor **desligado**. Voltei à Kally padrão.");
    }
    setDev({ ...dev, active: true, instructions: arg.slice(0, 2000) });
    notice("Modo desenvolvedor **ligado** com as suas instruções. Use `/dev off` para voltar à Kally padrão.");
  }
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

  function startNew() {
    if (loading) return;
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

  /** Começa a processar o anexo na hora (em segundo plano); a pessoa segue escrevendo. */
  function processAttachment(part: Blob, name: string, localUri: string | undefined, isImage: boolean) {
    const id = ++attachSeq.current;
    setAttachment({ id, name, localUri, isImage, status: "processing" });
    const form = new FormData();
    form.append("file", part, name);
    api.kallyAttachment(form).then(
      (result) => setAttachment((a) => (a?.id === id ? { ...a, status: "ready", result } : a)),
      (cause) => setAttachment((a) => (a?.id === id ? { ...a, status: "error", error: cause instanceof Error ? cause.message : "Não consegui ler o anexo." } : a)),
    );
  }

  async function pickDocument() {
    const result = await DocumentPicker.getDocumentAsync({ type: Platform.OS === "web" ? ["image/*", "application/pdf", "text/*", ".md", ".csv", ".docx", "audio/*"] : ["*/*"], copyToCacheDirectory: true });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    if ((asset.size ?? 0) > 25 * 1024 * 1024) return Alert.alert("Anexo", "O anexo deve ter no máximo 25 MB.");
    const part = Platform.OS === "web" ? (asset.file ?? (await (await fetch(asset.uri)).blob())) : (new File(asset.uri) as unknown as Blob);
    const isImage = (asset.mimeType ?? "").startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(asset.name);
    processAttachment(part, asset.name, isImage ? asset.uri : undefined, isImage);
  }

  async function pickPhoto() {
    const asset = await pickImage();
    if (!asset) return;
    const { part, name } = await uploadablePart(asset);
    processAttachment(part, name, asset.uri, true);
  }

  function attach() {
    if (Platform.OS === "web") return void pickDocument().catch((e) => Alert.alert("Anexo", e instanceof Error ? e.message : "Erro"));
    Alert.alert("Anexar", "Imagens são descritas, PDF/Word/TXT/CSV viram texto e áudios são transcritos. Nada fica guardado.", [
      { text: "Foto", onPress: () => void pickPhoto().catch((e) => Alert.alert("Anexo", e instanceof Error ? e.message : "Erro")) },
      { text: "Arquivo", onPress: () => void pickDocument().catch((e) => Alert.alert("Anexo", e instanceof Error ? e.message : "Erro")) },
      { text: "Cancelar", style: "cancel" },
    ]);
  }

  // Enviou enquanto o anexo ainda era processado: manda sozinho quando ficar pronto.
  useEffect(() => {
    if (queued !== null && attachment?.status !== "processing") {
      const text = queued;
      setQueued(null);
      if (attachment?.status === "error") setDraft(text);
      else void send(text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued, attachment?.status]);

  async function send(raw: string) {
    const content = raw.trim();
    if (loading) return;
    if (/^\/dev(?:\s|$)/i.test(content)) {
      setDraft("");
      return devCommand(content);
    }
    const reviewing = mode === "revisar" && (reviewTarget || content.length > 400);
    if (!content && !(mode === "revisar" && reviewTarget)) return;
    if (attachment?.status === "processing") {
      setQueued(raw);
      setDraft("");
      return;
    }
    const ready = attachment?.status === "ready" ? attachment : null;
    const message = content || `Revise "${reviewTarget?.title}"`;

    const user: Message = { id: newId(), role: "user", content: message, attachmentName: ready?.name, imageUri: ready?.localUri, reviewSource: reviewing && !reviewTarget ? content : undefined };
    const assistant: Message = { id: newId(), role: "assistant", content: "", reviewSource: user.reviewSource };
    // Temporária: o app manda o histórico (o servidor não guarda nada).
    const temporaryHistory = conversationId ? undefined : messages.filter((m) => !m.local).slice(-10).map(({ role, content: c }) => ({ role, content: c }));
    setMessages((current) => [...current, user, assistant]);
    setDraft("");
    setTranscribed(false);
    setLoading(true);
    const payload = {
      message,
      mode,
      conversationId,
      save: !conversationId && save,
      history: temporaryHistory,
      web,
      attachment: ready?.result ? { name: ready.result.name, kind: ready.result.kind, text: ready.result.text } : undefined,
      review: reviewing ? { kind: reviewKind, ...(reviewTarget ? { postId: reviewTarget.id } : { text: content }) } : undefined,
      dev: dev.active ? { active: true, persona: dev.persona, instructions: dev.instructions, vulgar: dev.vulgar } : undefined,
    };
    setAttachment(null);
    setReviewTarget(null);

    // O texto chega em muitos pedaços: junta e atualiza a tela a cada ~60 ms (menos renderizações).
    let buffer = "";
    let timer: ReturnType<typeof setTimeout> | null = null;
    const update = (change: (m: Message) => Message) => setMessages((current) => current.map((m) => (m.id === assistant.id ? change(m) : m)));
    const flush = () => {
      timer = null;
      if (!buffer) return;
      const chunk = buffer;
      buffer = "";
      update((m) => ({ ...m, content: m.content + chunk }));
    };
    try {
      await streamEvents(api.kallyPath, payload, (event) => {
        if (event.conversationId) setConversationId(event.conversationId);
        if (event.mode) update((m) => ({ ...m, mode: event.mode, dev: event.dev === true }));
        if (event.sources) update((m) => ({ ...m, sources: event.sources as KallySource[] }));
        if (event.review) update((m) => ({ ...m, review: event.review as KallyReview }));
        if (event.text) {
          buffer += event.text;
          if (!timer) timer = setTimeout(flush, 60);
        }
      });
      if (timer) clearTimeout(timer);
      flush();
    } catch (cause) {
      if (timer) clearTimeout(timer);
      flush();
      update((m) => ({ ...m, failed: true, content: m.content || (cause instanceof Error ? cause.message : "Falha ao conversar com a Kally."), sources: m.content ? m.sources : [] }));
    } finally {
      setLoading(false);
      if (save || conversationId) void loadHistory();
    }
  }

  const available = MODES.filter((m) => !m.needsPublish || permissions.publish);
  const current = MODES.find((m) => m.mode === mode) ?? MODES[0];
  const renderItem = useCallback(({ item, index }: { item: Message; index: number }) => <Bubble item={item} pending={loading && index === messages.length - 1} />, [loading, messages.length]);
  const sendDisabled = loading || queued !== null || (!draft.trim() && !(mode === "revisar" && reviewTarget));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AmbientGlow intensity={0.55} />
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <View style={{ flex: 1 }}>
          <EnvironmentHeader title={dev.active ? "Kally · dev" : "Kally"} subtitle={dev.active ? `Modo desenvolvedor · ${DEV_PERSONAS.find((p) => p.id === dev.persona)?.label}` : started ? (conversationId ? "Conversa salva" : "Conversa temporária") : "Sua companhia neste ambiente"} />
        </View>
        <IconButton name="clock" label="Conversas salvas" onPress={() => { setShowHistory(true); void loadHistory(); }} />
        {started ? <IconButton name="plus" label="Nova conversa" onPress={startNew} /> : null}
      </View>

      {dev.active ? (
        <View style={styles.devBar}>
          <Icon name="settings" size={14} color={colors.warning} />
          <AppText variant="small" color={colors.warning} style={{ flex: 1 }}>Modo desenvolvedor ativo: personalidade definida por você.</AppText>
          <Touchable onPress={() => setDevSheet(true)}><AppText variant="small" color={colors.violet200}>Ajustar</AppText></Touchable>
          <Touchable onPress={() => { setDev({ ...dev, active: false }); notice("Modo desenvolvedor **desligado**. Voltei à Kally padrão."); }}><AppText variant="small" color={colors.violet200}>Padrão</AppText></Touchable>
        </View>
      ) : null}

      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: space.lg, gap: space.lg, flexGrow: 1 }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={Platform.OS !== "web"}
        windowSize={9}
        ListEmptyComponent={
          <Animated.View entering={FadeIn.duration(400)} style={styles.empty}>
            <View style={styles.badge}><Icon name="sparkle" size={22} color={colors.violet300} /></View>
            <AppText variant="title" style={{ textAlign: "center", marginTop: space.md }}>Oi! Sobre o que vamos conversar?</AppText>
            <AppText color={colors.muted} style={{ textAlign: "center", marginTop: space.sm }}>
              Fale do seu dia, tire uma dúvida, peça ajuda para escrever ou revisar. Em {environment.name}, a Kally consulta seus pensamentos quando isso ajuda.
            </AppText>
            <Touchable onPress={() => setSave((v) => !v)} style={styles.saveToggle} accessibilityRole="switch" accessibilityState={{ checked: save }}>
              <View style={[styles.check, save && styles.checkOn]}>{save ? <Icon name="check" size={14} color="#FFFFFF" strokeWidth={2.4} /> : null}</View>
              <View style={{ flex: 1 }}>
                <AppText variant="uiMedium">Salvar esta conversa</AppText>
                <AppText variant="small" color={colors.faint}>{save ? "Fica no seu histórico deste ambiente (só você vê)." : "Temporária: nada fica guardado quando você sair."}</AppText>
              </View>
            </Touchable>
          </Animated.View>
        }
        renderItem={renderItem}
      />

      {transcribed ? <AppText variant="small" color={colors.warning} style={styles.note}>Transcrição do áudio: revise e edite antes de enviar.</AppText> : null}
      {queued !== null ? <AppText variant="small" color={colors.violet300} style={styles.note}>Sua mensagem sai assim que o anexo terminar de ser lido…</AppText> : null}

      {attachment ? (
        <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(160)} style={[styles.attachment, attachment.status === "error" && { borderColor: colors.danger }]}>
          {attachment.localUri ? <Image source={{ uri: attachment.localUri }} style={styles.attachThumb} /> : <View style={styles.attachIcon}><Icon name="doc" size={18} color={colors.violet300} /></View>}
          <View style={{ flex: 1 }}>
            <AppText variant="small" numberOfLines={1}>{attachment.name}</AppText>
            <AppText variant="small" color={attachment.status === "error" ? colors.danger : colors.faint} numberOfLines={2}>
              {attachment.status === "processing"
                ? attachment.isImage ? "Descrevendo a imagem…" : "Lendo o arquivo…"
                : attachment.status === "error"
                  ? attachment.error
                  : `Pronto · ${ATTACH_LABEL[attachment.result!.kind]}${attachment.result!.pages ? ` · ${attachment.result!.pages} pág.` : ""}${attachment.result!.truncated ? " (parcial)" : ""}`}
            </AppText>
          </View>
          {attachment.status === "processing" ? <ActivityIndicator color={colors.violet300} /> : null}
          <IconButton name="close" label="Remover anexo" color={colors.muted} onPress={() => { setAttachment(null); setQueued(null); }} />
        </Animated.View>
      ) : null}

      {mode === "revisar" ? (
        <View style={styles.reviewBar}>
          <Touchable onPress={() => setPicking(true)} style={[styles.tool, { flex: 1 }]}>
            <Icon name="doc" size={14} color={colors.violet300} />
            <AppText variant="small" numberOfLines={1} color={colors.violet200} style={{ flex: 1 }}>{reviewTarget ? reviewTarget.title : "Escolher pensamento (ou cole o texto)"}</AppText>
          </Touchable>
          <Chip label="Textual" selected={reviewKind === "textual"} onPress={() => setReviewKind("textual")} />
          <Chip label="Intelectual" selected={reviewKind === "intelectual"} onPress={() => setReviewKind("intelectual")} />
        </View>
      ) : null}

      <View style={styles.tools}>
        <Touchable onPress={() => setModeMenu(true)} style={[styles.tool, mode !== "auto" && styles.toolOn]} accessibilityLabel={`Modo: ${current.label}. Tocar para trocar`}>
          <Icon name={current.icon} size={14} color={mode !== "auto" ? colors.violet200 : colors.muted} />
          <AppText variant="small" color={mode !== "auto" ? colors.violet200 : colors.muted}>{current.label} ▾</AppText>
        </Touchable>
        <Touchable onPress={() => setWeb((v) => !v)} style={[styles.tool, web && styles.toolOn]} accessibilityRole="switch" accessibilityState={{ checked: web }} accessibilityLabel="Permitir pesquisa na internet">
          <Icon name="globe" size={14} color={web ? colors.violet200 : colors.muted} />
          <AppText variant="small" color={web ? colors.violet200 : colors.muted}>Web</AppText>
        </Touchable>
        <Touchable onPress={attach} disabled={attachment?.status === "processing"} style={styles.tool} accessibilityLabel="Anexar arquivo">
          <Icon name="clip" size={14} color={colors.muted} />
          <AppText variant="small" color={colors.muted}>Anexo</AppText>
        </Touchable>
      </View>

      <View style={[styles.composer, { paddingBottom: space.md }]}>
        <VoiceButton
          transcribe={api.transcribe}
          disabled={loading || !permissions.publish}
          onText={(text) => {
            setDraft((value) => (value.trim() ? `${value.trim()}\n\n${text}` : text));
            setTranscribed(true);
          }}
        />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={mode === "revisar" ? (reviewTarget ? "Algum foco? (opcional)" : "Cole o texto para revisar…") : mode === "ideia" ? "Conte sua ideia…" : mode === "aprender" ? "O que você quer aprender?" : permissions.publish ? "Fale com a Kally… (/post cria um post)" : "Fale com a Kally…"}
          placeholderTextColor={colors.faint}
          selectionColor={colors.violet400}
          maxLength={mode === "revisar" ? 4000 : 4000}
          multiline
          style={styles.input}
        />
        <Touchable accessibilityRole="button" accessibilityLabel="Enviar" disabled={sendDisabled} onPress={() => void send(draft)} style={[styles.send, sendDisabled && { opacity: 0.4 }]}>
          {loading || queued !== null ? <ActivityIndicator color="#FFFFFF" /> : <Icon name="send" size={20} color="#FFFFFF" strokeWidth={2} />}
        </Touchable>
      </View>

      <Modal visible={modeMenu} transparent animationType="fade" onRequestClose={() => setModeMenu(false)}>
        <Pressable style={styles.backdrop} onPress={() => setModeMenu(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
            <AppText variant="label" color={colors.faint} style={{ marginBottom: space.sm }}>Como a Kally deve ajudar</AppText>
            <Touchable onPress={() => { setModeMenu(false); setDevSheet(true); }} style={[styles.modeRow, dev.active && styles.modeRowDev]}>
              <Icon name="settings" size={18} color={dev.active ? colors.warning : colors.muted} />
              <View style={{ flex: 1 }}>
                <AppText variant="uiMedium" color={dev.active ? colors.warning : colors.text}>Modo desenvolvedor {dev.active ? "· ativo" : ""}</AppText>
                <AppText variant="small" color={colors.faint}>Personalidade e estilo definidos por você (/dev)</AppText>
              </View>
            </Touchable>
            {available.map((m) => (
              <Touchable key={m.mode} onPress={() => { setMode(m.mode); setModeMenu(false); }} style={[styles.modeRow, m.mode === mode && styles.modeRowOn]}>
                <Icon name={m.icon} size={18} color={m.mode === mode ? colors.violet200 : colors.muted} />
                <View style={{ flex: 1 }}>
                  <AppText variant="uiMedium" color={m.mode === mode ? colors.violet200 : colors.text}>{m.label}</AppText>
                  <AppText variant="small" color={colors.faint}>{m.hint}</AppText>
                </View>
                {m.mode === mode ? <Icon name="check" size={16} color={colors.violet300} /> : null}
              </Touchable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <DevSheet visible={devSheet} value={dev} onClose={() => setDevSheet(false)} onSave={(next) => { setDev(next); setDevSheet(false); notice(next.active ? "Modo desenvolvedor **ligado** com a nova configuração." : "Modo desenvolvedor **desligado**. Voltei à Kally padrão."); }} />

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
                      <AppText variant="small" color={colors.faint}>{formatDateShort(item.updatedAt)}</AppText>
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

/** Configuração do Modo Desenvolvedor: personalidade, instruções e linguagem. */
function DevSheet({ visible, value, onClose, onSave }: { visible: boolean; value: DevConfig; onClose: () => void; onSave: (next: DevConfig) => void }) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState(value);
  useEffect(() => {
    if (visible) setForm({ ...value, active: true });
  }, [visible, value]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + space.lg, gap: space.sm }]}>
          <AppText variant="title">Modo desenvolvedor</AppText>
          <AppText variant="small" color={colors.faint}>Você define personalidade, tom e estilo da Kally. As permissões e a privacidade do Minha Mente continuam as mesmas. Fica salvo neste aparelho.</AppText>
          <AppText variant="label" color={colors.faint} style={{ marginTop: space.sm }}>Personalidade</AppText>
          <View style={styles.actions}>
            {DEV_PERSONAS.map((p) => <Chip key={p.id} label={p.label} selected={form.persona === p.id} onPress={() => setForm({ ...form, persona: p.id })} />)}
          </View>
          <AppText variant="label" color={colors.faint} style={{ marginTop: space.sm }}>Instruções (prioridade sobre o estilo padrão)</AppText>
          <TextInput
            value={form.instructions}
            onChangeText={(instructions) => setForm({ ...form, instructions })}
            placeholder="Ex.: fale como um amigo de bar, me chame de chefe, respostas curtas…"
            placeholderTextColor={colors.faint}
            multiline
            maxLength={2000}
            style={[styles.input, styles.bodyInput, { minHeight: 110 }]}
          />
          <View style={styles.actions}>
            <Chip label={form.vulgar ? "Linguagem vulgar liberada" : "Sem linguagem vulgar"} selected={form.vulgar} onPress={() => setForm({ ...form, vulgar: !form.vulgar })} />
          </View>
          <View style={styles.actions}>
            <Button label="Ativar" icon="check" compact onPress={() => onSave({ ...form, active: true })} />
            <Button label="Voltar à Kally padrão" variant="secondary" compact onPress={() => onSave({ ...form, active: false })} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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

/** Memo: durante o streaming só a última bolha muda; as outras não são redesenhadas. */
const Bubble = memo(function Bubble({ item, pending }: { item: Message; pending: boolean }) {
  const isUser = item.role === "user";
  const { before, draft, after } = isUser ? { before: item.content, draft: null, after: "" } : extractDraft(item.content);
  const internal = item.sources?.filter((s) => s.kind !== "web") ?? [];
  const external = item.sources?.filter((s) => s.kind === "web") ?? [];
  return (
    <Animated.View entering={FadeInDown.duration(220)} style={[styles.bubble, isUser ? styles.user : styles.assistant, item.failed && { borderColor: colors.danger }]}>
      <AppText variant="label" color={isUser ? colors.violet300 : colors.faint} style={{ marginBottom: space.xs }}>
        {isUser ? "Você" : item.local ? "Minha Mente" : `Kally${item.dev ? " · dev" : ""}${item.mode && item.mode !== "chat" ? ` · ${modeLabel(item.mode) ?? item.mode}` : ""}`}
      </AppText>
      {item.imageUri ? <Image source={{ uri: item.imageUri }} style={styles.bubbleImage} resizeMode="cover" /> : null}
      {item.attachmentName && !item.imageUri ? <AppText variant="small" color={colors.violet300} style={{ marginBottom: space.xs }}>📎 {item.attachmentName}</AppText> : null}
      {!item.content ? (
        <View style={styles.typing}><ActivityIndicator size="small" color={colors.violet300} /><AppText variant="small" color={colors.muted}>{item.mode === "revisar" ? "Revisando…" : "Pensando…"}</AppText></View>
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
    </Animated.View>
  );
});

/**
 * Prévia do pensamento preparado pela Kally, dentro da conversa: compacta, editável
 * (título, pastas, texto), com Publicar (sempre com confirmação), Salvar rascunho e
 * Cancelar. Salva pelo backend do ambiente atual, com as permissões da própria pessoa.
 */
type Stage = "preview" | "editing" | "confirm" | "saving" | "cancelled" | { saved: "PUBLISHED" | "DRAFT"; id: string; slug: string; environment: string };

function DraftCard({ draft, pending }: { draft: { title: string; content: string; categories: string[] }; pending: boolean }) {
  const { api, permissions, environment } = useCurrentEnvironment();
  const [title, setTitle] = useState(draft.title);
  const [content, setContent] = useState(draft.content);
  const [selected, setSelected] = useState<string[]>([]);
  const [envCategories, setEnvCategories] = useState<string[] | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [stage, setStage] = useState<Stage>("preview");
  const [images, setImages] = useState(false);

  // Enquanto a Kally ainda escreve, a prévia acompanha o texto; depois, as edições são da pessoa.
  useEffect(() => {
    if (!pending) return;
    setTitle(draft.title);
    setContent(draft.content);
  }, [pending, draft.title, draft.content]);

  // Pastas do ambiente atual; a sugestão da Kally só vale se a pasta existir aqui.
  useEffect(() => {
    let alive = true;
    api.categories().then(
      ({ categories }) => {
        if (!alive) return;
        const names = categories.map((c) => c.name);
        setEnvCategories(names);
        setSelected(names.filter((n) => draft.categories.some((s) => s.toLowerCase() === n.toLowerCase())));
      },
      () => alive && setEnvCategories([]),
    );
    return () => {
      alive = false;
    };
  }, [api, draft.categories]);

  async function save(publish: boolean) {
    if (!title.trim() || !content.trim()) return Alert.alert("Pensamento", "Dê um título e um texto antes de salvar.");
    setStage("saving");
    try {
      const saved = await api.kallySavePost({ title: title.trim(), content, categories: selected, publish, private: isPrivate });
      setStage({ saved: saved.status, id: saved.id, slug: saved.slug, environment: saved.environment.name });
    } catch (cause) {
      setStage("preview");
      Alert.alert(publish ? "Publicar" : "Rascunho", cause instanceof Error ? cause.message : "Não consegui salvar o pensamento.");
    }
  }

  if (stage === "cancelled") {
    return (
      <View style={[styles.card, styles.cardRow]}>
        <AppText variant="small" color={colors.faint} style={{ flex: 1 }}>Prévia descartada.</AppText>
        <Button label="Desfazer" variant="ghost" compact onPress={() => setStage("preview")} />
      </View>
    );
  }

  if (typeof stage === "object") {
    const published = stage.saved === "PUBLISHED";
    return (
      <Animated.View entering={FadeIn.duration(250)} style={[styles.card, published && styles.cardDone]}>
        <View style={styles.cardRow}>
          <Icon name="check" size={18} color={published ? colors.success : colors.violet300} strokeWidth={2.2} />
          <AppText variant="uiMedium" style={{ flex: 1 }}>{published ? `Publicado em ${stage.environment}` : "Rascunho salvo"}</AppText>
        </View>
        <AppText variant="small" color={colors.muted} numberOfLines={1} style={{ marginTop: space.xs }}>“{title}”</AppText>
        <View style={styles.actions}>
          {published ? (
            <Button label="Ver pensamento" icon="eye" compact onPress={() => router.push({ pathname: "/post/[slug]", params: { slug: stage.slug } })} />
          ) : (
            <Button label="Abrir no editor" icon="edit" compact onPress={() => router.push({ pathname: "/editor/[id]", params: { id: stage.id } })} />
          )}
        </View>
      </Animated.View>
    );
  }

  const editing = stage === "editing";
  const busy = stage === "saving";
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <AppText variant="label" color={colors.violet300} style={{ flex: 1 }}>Prévia do pensamento</AppText>
        {!pending && !busy && stage !== "confirm" ? (
          <IconButton name={editing ? "check" : "edit"} label={editing ? "Concluir edição" : "Editar prévia"} color={colors.violet300} onPress={() => setStage(editing ? "preview" : "editing")} />
        ) : null}
      </View>

      {editing ? (
        <TextInput value={title} onChangeText={setTitle} placeholder="Título" placeholderTextColor={colors.faint} maxLength={200} style={[styles.input, styles.titleInput]} />
      ) : title ? (
        <AppText variant="uiMedium" style={{ marginTop: space.xs }}>{title}</AppText>
      ) : null}

      {envCategories?.length ? (
        <View style={[styles.actions, { marginTop: space.sm }]}>
          {(editing ? envCategories : selected).map((name) => (
            <Chip key={name} label={name} selected={selected.includes(name)} onPress={editing ? () => setSelected((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name])) : undefined} />
          ))}
          {editing ? <Chip label={isPrivate ? "Privado" : "Público"} selected={isPrivate} onPress={() => setIsPrivate((v) => !v)} /> : isPrivate ? <Chip label="Privado" selected /> : null}
        </View>
      ) : null}

      {editing ? (
        <TextInput value={content} onChangeText={setContent} multiline placeholder="Texto do pensamento" placeholderTextColor={colors.faint} style={[styles.input, styles.bodyInput]} />
      ) : (
        <Touchable onPress={() => setExpanded((v) => !v)}>
          <AppText variant="small" color={colors.muted} numberOfLines={expanded ? undefined : 6} style={{ marginTop: space.sm }}>{content}</AppText>
          {content.length > 320 ? <AppText variant="small" color={colors.violet300}>{expanded ? "Mostrar menos" : "Ver tudo"}</AppText> : null}
        </Touchable>
      )}

      {stage === "confirm" ? (
        <Animated.View entering={FadeInDown.duration(200)} style={styles.confirm}>
          <AppText variant="uiMedium">Publicar em {environment.name}?</AppText>
          <AppText variant="small" color={colors.muted}>{isPrivate ? "Fica visível só para participantes do ambiente." : "Fica visível para quem pode ler este ambiente."}</AppText>
          <View style={styles.actions}>
            <Button label="Confirmar publicação" icon="check" compact onPress={() => void save(true)} />
            <Button label="Voltar" variant="secondary" compact onPress={() => setStage("preview")} />
          </View>
        </Animated.View>
      ) : permissions.publish && !pending ? (
        <View style={styles.actions}>
          <Button label="Publicar" icon="send" compact loading={busy} disabled={busy} onPress={() => setStage("confirm")} />
          <Button label="Salvar rascunho" icon="doc" variant="secondary" compact disabled={busy} onPress={() => void save(false)} />
          <Button label="Imagens" icon="image" variant="ghost" compact disabled={busy} onPress={() => setImages(true)} />
          <Button label="Editor" icon="edit" variant="ghost" compact disabled={busy} onPress={() => { handOffDraft({ title, content }); router.push({ pathname: "/editor/[id]", params: { id: "novo" } }); }} />
          <Button label="Cancelar" variant="ghost" compact disabled={busy} onPress={() => setStage("cancelled")} />
        </View>
      ) : !permissions.publish ? (
        <AppText variant="small" color={colors.faint} style={{ marginTop: space.sm }}>Você não tem permissão para publicar neste ambiente.</AppText>
      ) : null}
      <ImagePickerSheet visible={images} query={title} onClose={() => setImages(false)} onInsert={(markdown) => { setContent((c) => `${c.trim()}\n\n${markdown}`); setImages(false); }} />
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
  attachment: { flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.md, marginTop: space.xs, padding: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.violet800, backgroundColor: colors.violet950 },
  tools: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  tool: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.line },
  toolOn: { borderColor: colors.violet600, backgroundColor: colors.violet950 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm },
  input: { ...type.ui, flex: 1, color: colors.text, maxHeight: 140, minHeight: 44, paddingHorizontal: space.md, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface },
  send: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.violet600, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  cardRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  cardDone: { borderColor: colors.violet600 },
  confirm: { marginTop: space.md, padding: space.md, gap: space.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.violet600, backgroundColor: colors.violet950 },
  titleInput: { marginTop: space.sm, minHeight: 40, flex: 0 },
  bodyInput: { marginTop: space.sm, minHeight: 140, maxHeight: 280, flex: 0, textAlignVertical: "top" },
  attachThumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surface },
  attachIcon: { width: 44, height: 44, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  bubbleImage: { width: 180, height: 140, borderRadius: radius.md, marginBottom: space.sm, backgroundColor: colors.surface },
  typing: { flexDirection: "row", alignItems: "center", gap: space.sm },
  reviewBar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm },
  modeRow: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.md },
  modeRowDev: { borderWidth: 1, borderColor: colors.warning },
  devBar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm, backgroundColor: colors.surfaceRaised, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  modeRowOn: { backgroundColor: colors.violet950, borderWidth: 1, borderColor: colors.violet800 },
  row2: { flexDirection: "row", alignItems: "center", gap: space.sm, justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  thumb: { width: "31%", aspectRatio: 1, borderRadius: radius.sm, overflow: "hidden", backgroundColor: colors.surface },
  preview: { width: "100%", height: 220, borderRadius: radius.md, backgroundColor: colors.surface },
});
