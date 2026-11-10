import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, FlatList, Image, Linking, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Alert } from "@/lib/alert";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { cancelAnimation, Easing, interpolateColor, scrollTo, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { streamEvents } from "@/lib/stream";
import { api as accountApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCurrentEnvironment } from "@/lib/environment";
import { applySuggestions, extractDraft, handOffDraft } from "@/lib/draft-handoff";
import { hasStructure } from "@/lib/structured";
import { formatDateShort, formatHandle } from "@/lib/format";
import { pickImage, uploadablePart } from "@/lib/upload";
import { getItem, setItem } from "@/lib/secure-storage";
import type { KallyAttachment, KallyConversation, KallyImage, KallyMode, KallyReview, KallySource } from "@/lib/types";
import { Markdown } from "@/components/markdown/markdown";
import { EnvironmentHeader, goToEnvironments, ROLE_LABEL } from "@/components/environment-header";
import { VoiceButton } from "@/components/voice-button";
import { AppText, Button, Chip, IconButton, StateView, Touchable } from "@/components/ui/primitives";
import { Icon, type IconName } from "@/components/ui/icon";
import { colors, elevation, gradients, radius, space, tint, type } from "@/theme/tokens";
import { KeyboardScreen } from "@/components/keyboard-screen";
import { KallyOrbital, useKallyActivity, type KallyOrbitalState } from "@/components/kally/orbital";
import { ORBIT_SIZE, OrbitDock, useOrbitDock } from "@/components/kally/orbit-dock";
import { LinearGradient } from "expo-linear-gradient";
import { Surface } from "@/components/ui/surface";
import { Sheet } from "@/components/ui/sheet";
import { enter, exit, layoutTransition, spring, timing } from "@/theme/motion";
import { maxWidths, useContainer, useLayout } from "@/theme/layout";

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
  /** modelo que respondeu e métricas do Ollama (só no Modo Desenvolvedor) */
  model?: string;
  stats?: DevStats;
  /** etapa em andamento antes do primeiro texto (ex.: "Procurando fontes para o seu post…") */
  status?: string;
};
type DevStats = {
  loadSeconds?: number;
  tokensPerSecond?: number;
  outputTokens?: number;
  thinkingChars?: number;
  firstTextSeconds?: number | null;
  wallSeconds?: number;
  memory?: { totalGB: number; vramGB: number; cpuGB: number; context: number } | null;
  /** pipeline interpretador → executor (só para o administrador) */
  pipeline?: { interpreted: boolean; competence: string | null; interpreterSeconds: number; swapSeconds: number; queueSeconds: number; totalSeconds: number };
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

type PendingAttachment = {
  id: number;
  name: string;
  localUri?: string;
  isImage: boolean;
  status: "processing" | "ready" | "error";
  result?: KallyAttachment;
  error?: string;
  /** o arquivo, para salvar na base pessoal se a pessoa quiser */
  part?: Blob;
  saved?: "saving" | "saved" | "reused" | "error";
  saveError?: string;
};

const ATTACH_LABEL: Record<KallyAttachment["kind"], string> = { pdf: "PDF", imagem: "imagem descrita", texto: "texto", docx: "Word", csv: "CSV", audio: "áudio transcrito" };

/** Modo Desenvolvedor: personalidade definida pela pessoa, guardada neste aparelho. */
type DevConfig = { active: boolean; persona: DevPersona; instructions: string; vulgar: boolean; model: "padrao" | "experimental" };
type DevPersona = "livre" | "direta" | "divertida" | "deferente" | "formal";
const DEV_KEY = "minha-mente.kally-dev.v1";
const DEV_OFF: DevConfig = { active: false, persona: "livre", instructions: "", vulgar: false, model: "experimental" };
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
  const container = useContainer("form");
  if (user) return <Kally />;
  return (
    <View style={[{ flex: 1, paddingTop: insets.top + space.lg, paddingBottom: space.xl }, container]}>
      <EnvironmentHeader title="Kally" />
      <View style={styles.guest}>
        <KallyOrbital size={168} state="idle" interactive announce />
        <AppText variant="hero" style={{ textAlign: "center" }}>Converse com a Kally</AppText>
        <AppText color={colors.muted} style={{ textAlign: "center", maxWidth: 320 }}>Entre com sua conta para conversar com a Kally.</AppText>
      </View>
      <Button label="Entrar" onPress={() => router.push("/login")} />
    </View>
  );
}

function Kally() {
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  const column = { flex: 1, width: "100%" as const, maxWidth: maxWidths.content + gutter * 2, alignSelf: "center" as const };
  const { api, environment, permissions, role } = useCurrentEnvironment();
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
  // A Kally desta pessoa consulta a base de documentos? (o servidor decide; hoje, o pipeline em teste)
  const [baseEnabled, setBaseEnabled] = useState(false);
  const [queued, setQueued] = useState<string | null>(null);
  const [reviewKind, setReviewKind] = useState<ReviewKind>("intelectual");
  const [reviewTarget, setReviewTarget] = useState<{ id: string; title: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [history, setHistory] = useState<KallyConversation[] | null>(null);
  const [historyAll, setHistoryAll] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // Conversa de outra pessoa aberta pelo dev da plataforma: só leitura (o servidor não deixa continuar).
  const [readingOwner, setReadingOwner] = useState<NonNullable<KallyConversation["owner"]> | null>(null);
  const [dev, setDevState] = useState<DevConfig>(DEV_OFF);
  // Modo Desenvolvedor: só para o administrador da plataforma (o servidor também confere).
  const signedUser = useAuth().user;
  const isAdmin = signedUser?.legacyKind === "ADMIN";
  const devOn = dev.active && isAdmin;
  // Modelo, modo e tempos de geração só para quem cuida da plataforma (admin ou dev).
  const technical = isAdmin || role === "DEV";
  useEffect(() => {
    if (!signedUser) return setBaseEnabled(false);
    accountApi.kallyDocuments().then((r) => setBaseEnabled(r.enabled), () => setBaseEnabled(false));
  }, [signedUser]);
  const [devSheet, setDevSheet] = useState(false);
  const list = useAnimatedRef<FlatList<Message>>();
  const attachSeq = useRef(0);
  const { activity, kick } = useKallyActivity();
  // Voz: nível real do microfone (0–1) alimenta a órbita no estado "escutando".
  const voiceLevel = useSharedValue(0);
  const [listening, setListening] = useState(false);
  const onVoiceLevel = useCallback((value: number) => {
    voiceLevel.value = withTiming(value, { duration: 90 });
  }, [voiceLevel]);
  const composerFocus = useSharedValue(0);

  // Rolagem previsível: a conversa só acompanha o fim se a pessoa já está nele; quem subiu
  // para reler não é puxado de volta a cada pedaço de texto.
  const scrollY = useSharedValue(0);
  const contentHeight = useSharedValue(0);
  const viewHeight = useSharedValue(0);
  const atEnd = useSharedValue(true);
  const lastOffset = useSharedValue(0);
  const [following, setFollowing] = useState(true);
  const keyboardInset = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      contentHeight.value = event.contentSize.height;
      viewHeight.value = event.layoutMeasurement.height;
      const offset = event.contentOffset.y;
      const end = offset + event.layoutMeasurement.height >= event.contentSize.height - 72;
      // Só subir (gesto da pessoa) desliga o acompanhamento. A própria rolagem animada até o
      // fim também gera eventos no meio do caminho e, com o texto crescendo, não pode desligá-lo.
      if (end && !atEnd.value) {
        atEnd.value = true;
        scheduleOnRN(setFollowing, true);
      } else if (!end && atEnd.value && offset < lastOffset.value - 2) {
        atEnd.value = false;
        scheduleOnRN(setFollowing, false);
      }
      lastOffset.value = offset;
    },
  });
  // Teclado abrindo/fechando: a conversa sobe e desce junto, quadro a quadro (o que estava
  // visível no fim continua visível), sem salto nem reinício da rolagem.
  useAnimatedReaction(
    () => keyboardInset.value,
    (now, previous) => {
      if (previous === null || now === previous) return;
      scrollTo(list, 0, Math.max(0, scrollY.value + (now - previous)), false);
    },
  );
  // Durante o streaming, a rolagem persegue o fim quadro a quadro (aproximação exponencial,
  // ~90 ms de constante): o texto novo entra sem degraus. Só roda enquanto há resposta
  // chegando e a pessoa está no fim; subir para reler desliga (atEnd).
  const chaseY = useSharedValue(0);
  const chaseLive = useSharedValue(false);
  const chase = useFrameCallback((info) => {
    "worklet";
    if (!atEnd.value) {
      chaseLive.value = false;
      return;
    }
    // Retomando (a pessoa voltou ao fim) ou a rolagem real passou à frente (teclado, rolagem
    // nativa): adota a posição real. Nunca volta atrás por causa de um evento atrasado.
    if (!chaseLive.value || scrollY.value > chaseY.value + 1) {
      chaseY.value = scrollY.value;
      chaseLive.value = true;
    }
    const target = Math.max(0, contentHeight.value - viewHeight.value);
    const gap = target - chaseY.value;
    if (gap <= 0.5) return;
    const dt = Math.min(info.timeSincePreviousFrame ?? 16, 48);
    chaseY.value += gap * (1 - Math.exp(-dt / 90));
    scrollTo(list, 0, chaseY.value, false);
  }, false);
  /** Rola até o fim na UI thread, com as medidas atuais (igual no celular e na web). */
  const scrollToEnd = useCallback(
    (animated: boolean) => {
      scheduleOnUI(() => {
        "worklet";
        scrollTo(list, 0, Math.max(0, contentHeight.value - viewHeight.value), animated);
      });
    },
    [list, contentHeight, viewHeight],
  );
  const goToEnd = useCallback(
    (animated: boolean) => {
      atEnd.value = true;
      setFollowing(true);
      scrollToEnd(animated);
    },
    [atEnd, scrollToEnd],
  );

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
    if (!isAdmin) return notice("O modo desenvolvedor está disponível só para o administrador.");
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
      const result = await api.kallyConversations();
      setHistory(result.conversations);
      setHistoryAll(!!result.allUsers);
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
    setReadingOwner(null);
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
      setReadingOwner(full.owner ?? null);
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
    setAttachment({ id, name, localUri, isImage, status: "processing", part });
    const form = new FormData();
    form.append("file", part, name);
    api.kallyAttachment(form).then(
      (result) => setAttachment((a) => (a?.id === id ? { ...a, status: "ready", result } : a)),
      (cause) => setAttachment((a) => (a?.id === id ? { ...a, status: "error", error: cause instanceof Error ? cause.message : "Não consegui ler o anexo." } : a)),
    );
  }

  /**
   * Anexos são temporários: valem só para a mensagem. Salvar na base pessoal faz a Kally
   * consultar o documento nas próximas perguntas (só para esta pessoa).
   */
  function saveToBase() {
    const current = attachment;
    if (!current?.part) return;
    setAttachment((a) => (a?.id === current.id ? { ...a, saved: "saving" } : a));
    const form = new FormData();
    form.append("file", current.part, current.name);
    accountApi.addKallyDocument(form).then(
      (r) => setAttachment((a) => (a?.id === current.id ? { ...a, saved: r.reused ? "reused" : "saved" } : a)),
      (cause) => setAttachment((a) => (a?.id === current.id ? { ...a, saved: "error", saveError: cause instanceof Error ? cause.message : "Não consegui salvar na base." } : a)),
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
    if (loading || readingOwner) return;
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
    goToEnd(true);
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
      dev: devOn ? { active: true, persona: dev.persona, instructions: dev.instructions, vulgar: dev.vulgar, model: dev.model } : undefined,
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
        if (event.status) update((m) => ({ ...m, status: event.status }));
        const extra = event as { model?: string; stats?: DevStats };
        if (extra.model) update((m) => ({ ...m, model: extra.model }));
        if (extra.stats) update((m) => ({ ...m, stats: extra.stats }));
        if (event.text) {
          kick();
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
  const renderItem = useCallback(({ item, index }: { item: Message; index: number }) => <Bubble item={item} pending={loading && index === messages.length - 1} technical={technical} />, [loading, messages.length, technical]);
  const lastMessage = messages[messages.length - 1];
  useEffect(() => {
    chaseLive.value = false;
    chase.setActive(loading && following);
  }, [loading, following, chase, chaseLive]);
  // Estado real: escutando (gravando), preparando (sem texto ainda), respondendo (texto
  // chegando), falha na última resposta, ou pronta.
  const orbState: KallyOrbitalState = listening ? "listening" : loading ? (lastMessage?.role === "assistant" && lastMessage.content ? "responding" : "thinking") : lastMessage?.failed ? "error" : attachment?.status === "processing" ? "thinking" : "idle";
  const subtitle = readingOwner ? `Conversa de ${readingOwner.displayName}` : devOn ? `Modo desenvolvedor · ${DEV_PERSONAS.find((p) => p.id === dev.persona)?.label}` : started ? (conversationId ? "Conversa salva" : "Conversa temporária") : "Sua companhia neste ambiente";
  // A órbita vai para o canto direito, logo acima da caixa de texto, quando o teclado abre (ou o
  // campo ganha foco na web) e volta ao cabeçalho enquanto a Kally responde.
  const orbit = useOrbitDock({ keyboardInset, composerFocus, answering: loading, gutter });
  const sendDisabled = loading || queued !== null || (!draft.trim() && !(mode === "revisar" && reviewTarget));

  return (
    <KeyboardScreen insetMirror={keyboardInset}>
      <View style={column} onLayout={orbit.onColumnLayout}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        {/* Lugar da órbita no cabeçalho: ela mesma flutua por cima (ver OrbitDock). */}
        {started ? <View onLayout={orbit.onSlotLayout} style={styles.orbitSlot} /> : null}
        <Animated.View layout={layoutTransition} style={{ flex: 1 }}>
          <Touchable onPress={goToEnvironments} pressScale={0.98} accessibilityRole="button" accessibilityLabel={`Trocar de ambiente (atual: ${environment.name})`} style={styles.envLink}>
            <AppText variant="label" color={colors.violet300} numberOfLines={1} style={{ flexShrink: 1 }}>{environment.name}</AppText>
            <AppText variant="label" color={colors.faint} numberOfLines={1}>· {ROLE_LABEL[role] ?? role}</AppText>
            <Icon name="swap" size={12} color={colors.violet300} />
          </Touchable>
          <AppText variant="title" style={styles.headerTitle}>{devOn ? "Kally · dev" : "Kally"}</AppText>
          <AppText variant="small" color={colors.faint} numberOfLines={1}>{subtitle}</AppText>
        </Animated.View>
        <IconButton name="clock" label="Conversas salvas" onPress={() => { setShowHistory(true); void loadHistory(); }} />
        {started ? <IconButton name="plus" label="Nova conversa" onPress={startNew} /> : null}
      </View>

      {devOn ? (
        <View style={styles.devBar}>
          <Icon name="settings" size={14} color={colors.warning} />
          <AppText variant="small" color={colors.warning} style={{ flex: 1 }}>Modo desenvolvedor ativo: personalidade definida por você.</AppText>
          <Touchable onPress={() => setDevSheet(true)}><AppText variant="small" color={colors.violet200}>Ajustar</AppText></Touchable>
          <Touchable onPress={() => { setDev({ ...dev, active: false }); notice("Modo desenvolvedor **desligado**. Voltei à Kally padrão."); }}><AppText variant="small" color={colors.violet200}>Padrão</AppText></Touchable>
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
      <Animated.FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => m.id}
        // flexGrow só para centralizar o estado vazio: com mensagens, no react-native-web ele
        // prenderia o conteúdo na altura da tela (e a lista nunca saberia que cresceu).
        contentContainerStyle={[{ padding: space.lg, gap: space.lg }, !messages.length && { flexGrow: 1 }]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // Durante o streaming o fim avança sem animação (várias animações seguidas tremem).
        onLayout={(event) => {
          viewHeight.value = event.nativeEvent.layout.height;
        }}
        onContentSizeChange={(_width, height) => {
          contentHeight.value = height;
          // Respondendo, quem acompanha o fim é a perseguição quadro a quadro.
          if (following && !loading) scrollToEnd(true);
        }}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={Platform.OS !== "web"}
        windowSize={9}
        ListEmptyComponent={
          <Animated.View entering={enter.rise} exiting={exit.fade} style={styles.empty}>
            <KallyOrbital size={156} state={orbState} activity={activity} level={voiceLevel} interactive announce />
            <AppText variant="hero" style={{ textAlign: "center", marginTop: space.lg }}>Oi! Sobre o que{"\n"}vamos conversar?</AppText>
            <AppText color={colors.muted} style={{ textAlign: "center", marginTop: space.sm }}>
              Fale do seu dia, tire uma dúvida, peça ajuda para escrever ou revisar. Em {environment.name}, a Kally consulta seus pensamentos quando isso ajuda.
            </AppText>
            <Touchable onPress={() => setSave((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: save }} aria-checked={save} pressScale={0.98} style={{ alignSelf: "stretch", marginTop: space.xl }}>
              <Surface active={save} contentStyle={styles.saveToggle}>
                <View style={[styles.check, save && styles.checkOn]}>{save ? <Icon name="check" size={14} color="#FFFFFF" strokeWidth={2.4} /> : null}</View>
                <View style={{ flex: 1 }}>
                  <AppText variant="uiMedium">Salvar esta conversa</AppText>
                  <AppText variant="small" color={colors.faint}>{save ? "Fica no seu histórico deste ambiente (só você vê)." : "Temporária: nada fica guardado quando você sair."}</AppText>
                </View>
              </Surface>
            </Touchable>
          </Animated.View>
        }
        renderItem={renderItem}
      />
      {!following && messages.length ? (
        <Animated.View entering={enter.fade} exiting={exit.fade} style={[styles.jump, { right: gutter }]}>
          <Touchable accessibilityLabel="Ir para a última mensagem" onPress={() => goToEnd(true)} pressScale={0.92} style={styles.jumpButton}>
            <View style={{ transform: [{ rotate: "-90deg" }] }}>
              <Icon name="back" size={16} color={colors.violet200} />
            </View>
          </Touchable>
        </Animated.View>
      ) : null}
      </View>

      {/* Tudo o que fica embaixo da lista: a órbita para logo acima disso quando o teclado abre. */}
      <View onLayout={orbit.onBottomLayout}>
      {transcribed ? (
        <Animated.View entering={enter.fade} exiting={exit.fade} layout={layoutTransition}>
          <AppText variant="small" color={colors.warning} style={styles.note}>Transcrição do áudio: revise e edite antes de enviar.</AppText>
        </Animated.View>
      ) : null}
      {queued !== null ? (
        <Animated.View entering={enter.fade} exiting={exit.fade} layout={layoutTransition}>
          <AppText variant="small" color={colors.violet300} style={styles.note}>Sua mensagem sai assim que o anexo terminar de ser lido…</AppText>
        </Animated.View>
      ) : null}

      {attachment ? (
        <Animated.View entering={enter.rise} exiting={exit.fade} layout={layoutTransition} style={[styles.attachment, attachment.status === "error" && { borderColor: colors.danger }]}>
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
            {/* Só documentos (não imagem nem áudio) vão para a base; o anexo continua temporário se a pessoa não salvar. */}
            {baseEnabled && attachment.status === "ready" && !attachment.isImage && attachment.result?.kind !== "audio" ? (
              attachment.saved === "saved" || attachment.saved === "reused" ? (
                <AppText variant="small" color={colors.success}>{attachment.saved === "reused" ? "Já estava na sua base" : "Salvo na sua base: a Kally vai consultá-lo"}</AppText>
              ) : attachment.saved === "error" ? (
                <AppText variant="small" color={colors.danger} numberOfLines={2}>{attachment.saveError}</AppText>
              ) : (
                <Touchable onPress={saveToBase} disabled={attachment.saved === "saving"} accessibilityLabel="Salvar o anexo na sua base de documentos">
                  <AppText variant="small" color={colors.violet300}>{attachment.saved === "saving" ? "Salvando na sua base…" : "Salvar na minha base"}</AppText>
                </Touchable>
              )
            ) : null}
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

      {readingOwner ? (
        <View style={[styles.devBar, { paddingBottom: space.md }]}>
          <Icon name="eye" size={14} color={colors.warning} />
          <AppText variant="small" color={colors.warning} style={{ flex: 1 }}>Conversa de {readingOwner.displayName} ({formatHandle(readingOwner.username)}). Só leitura, pelo acesso de dev.</AppText>
          <Touchable onPress={startNew}><AppText variant="small" color={colors.violet200}>Nova conversa</AppText></Touchable>
        </View>
      ) : (
      <>
      <View style={styles.composerWrap}>
      <ComposerFrame focus={composerFocus}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onFocus={() => {
            composerFocus.value = withTiming(1, timing.micro);
          }}
          onBlur={() => {
            composerFocus.value = withTiming(0, timing.short);
          }}
          placeholder={mode === "revisar" ? (reviewTarget ? "Algum foco? (opcional)" : "Cole o texto para revisar…") : mode === "ideia" ? "Conte sua ideia…" : mode === "aprender" ? "O que você quer aprender?" : permissions.publish ? "Fale com a Kally… (/post cria um post)" : "Fale com a Kally…"}
          placeholderTextColor={colors.faint}
          selectionColor={colors.violet400}
          maxLength={mode === "revisar" ? 4000 : 4000}
          multiline
          accessibilityLabel="Mensagem para a Kally"
          style={styles.composerInput}
        />
        <View style={styles.composerBar}>
          <Touchable onPress={attach} disabled={attachment?.status === "processing"} accessibilityLabel="Anexar arquivo" pressScale={0.9} style={styles.roundTool}>
            <Icon name="clip" size={17} color={colors.violet300} />
          </Touchable>
          <Touchable onPress={() => setModeMenu(true)} style={[styles.tool, styles.toolShrink, mode !== "auto" && styles.toolOn]} accessibilityLabel={`Modo: ${current.label}. Tocar para trocar`} pressScale={0.95}>
            <Icon name={current.icon} size={14} color={mode !== "auto" ? colors.violet200 : colors.muted} />
            <AppText variant="small" numberOfLines={1} color={mode !== "auto" ? colors.violet200 : colors.muted} style={{ flexShrink: 1 }}>{current.label}</AppText>
            <View style={{ transform: [{ rotate: "-90deg" }] }}>
              <Icon name="back" size={11} color={mode !== "auto" ? colors.violet200 : colors.faint} strokeWidth={2} />
            </View>
          </Touchable>
          <Touchable onPress={() => setWeb((v) => !v)} style={[styles.tool, web && styles.toolOn]} accessibilityRole="switch" accessibilityState={{ checked: web }} aria-checked={web} accessibilityLabel="Permitir pesquisa na internet" pressScale={0.95}>
            <Icon name="globe" size={14} color={web ? colors.violet200 : colors.muted} />
            <AppText variant="small" color={web ? colors.violet200 : colors.muted}>Web</AppText>
          </Touchable>
          <View style={{ flex: 1 }} />
          <VoiceButton
            transcribe={api.transcribe}
            disabled={loading || !permissions.publish}
            onLevel={onVoiceLevel}
            onRecordingChange={setListening}
            onText={(text) => {
              setDraft((value) => (value.trim() ? `${value.trim()}\n\n${text}` : text));
              setTranscribed(true);
            }}
          />
          <SendButton disabled={sendDisabled} busy={loading || queued !== null} onPress={() => void send(draft)} />
        </View>
      </ComposerFrame>
      </View>
      </>
      )}
      </View>

      {started ? (
        <OrbitDock orbit={orbit}>
          <KallyOrbital size={ORBIT_SIZE} state={orbState} activity={activity} level={voiceLevel} interactive announce />
        </OrbitDock>
      ) : null}
      </View>

      <Sheet visible={modeMenu} onClose={() => setModeMenu(false)}>
            <AppText variant="label" color={colors.faint} style={{ marginBottom: space.sm }}>Como a Kally deve ajudar</AppText>
            {isAdmin ? (
            <Touchable onPress={() => { setModeMenu(false); setDevSheet(true); }} style={[styles.modeRow, dev.active && styles.modeRowDev]}>
              <Icon name="settings" size={18} color={dev.active ? colors.warning : colors.muted} />
              <View style={{ flex: 1 }}>
                <AppText variant="uiMedium" color={dev.active ? colors.warning : colors.text}>Modo desenvolvedor {dev.active ? "· ativo" : ""}</AppText>
                <AppText variant="small" color={colors.faint}>Personalidade e estilo definidos por você (/dev)</AppText>
              </View>
            </Touchable>
            ) : null}
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
      </Sheet>

      <DevSheet visible={devSheet} value={dev} onClose={() => setDevSheet(false)} onSave={(next) => { setDev(next); setDevSheet(false); notice(next.active ? "Modo desenvolvedor **ligado** com a nova configuração." : "Modo desenvolvedor **desligado**. Voltei à Kally padrão."); }} />

      <PostPicker visible={picking} onClose={() => setPicking(false)} onPick={(post) => { setReviewTarget(post); setPicking(false); }} />

      <Sheet visible={showHistory} onClose={() => setShowHistory(false)}>
            <AppText variant="title">Conversas salvas</AppText>
            <AppText variant="small" color={colors.faint} style={{ marginBottom: space.md }}>{historyAll ? "Acesso de dev: as de todas as pessoas deste ambiente. As de outras pessoas abrem só para leitura." : "Só suas, só deste ambiente. As temporárias não aparecem aqui."}</AppText>
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
                      <AppText variant="small" color={colors.faint}>{item.owner ? `${item.owner.displayName} · ` : ""}{formatDateShort(item.updatedAt)}</AppText>
                    </Touchable>
                    {item.owner ? null : <IconButton name="trash" label="Apagar conversa" color={colors.muted} onPress={() => remove(item)} />}
                  </View>
                )}
              />
            )}
            <Button label="Nova conversa" icon="plus" variant="secondary" onPress={() => { setShowHistory(false); startNew(); }} style={{ marginTop: space.md }} />
      </Sheet>
    </KeyboardScreen>
  );
}

/** Configuração do Modo Desenvolvedor: personalidade, instruções e linguagem. */
function DevSheet({ visible, value, onClose, onSave }: { visible: boolean; value: DevConfig; onClose: () => void; onSave: (next: DevConfig) => void }) {
  const [form, setForm] = useState(value);
  useEffect(() => {
    if (visible) setForm({ ...value, active: true });
  }, [visible, value]);
  return (
    <Sheet visible={visible} onClose={onClose} keyboard style={{ gap: space.sm }}>
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
          <AppText variant="label" color={colors.faint} style={{ marginTop: space.sm }}>Modelo (para comparar com as mesmas mensagens)</AppText>
          <View style={styles.actions}>
            <Chip label="Padrão (o da Kally)" selected={form.model === "padrao"} onPress={() => setForm({ ...form, model: "padrao" })} />
            <Chip label="Experimental (do servidor)" selected={form.model !== "padrao"} onPress={() => setForm({ ...form, model: "experimental" })} />
          </View>
          <View style={styles.actions}>
            <Button label="Ativar" icon="check" compact onPress={() => onSave({ ...form, active: true })} />
            <Button label="Voltar à Kally padrão" variant="secondary" compact onPress={() => onSave({ ...form, active: false })} />
          </View>
    </Sheet>
  );
}

/** Pensamentos que a pessoa pode editar (os próprios, ou todos para quem gerencia). */
function PostPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (post: { id: string; title: string }) => void }) {
  const { api } = useCurrentEnvironment();
  const [posts, setPosts] = useState<{ id: string; title: string; status: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    api.managePosts().then((page) => setPosts(page.posts), (cause) => setError(cause instanceof Error ? cause.message : "Não consegui listar seus pensamentos."));
  }, [visible, api]);
  return (
    <Sheet visible={visible} onClose={onClose}>
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
    </Sheet>
  );
}

/** Memo: durante o streaming só a última bolha muda; as outras não são redesenhadas. */
/** Mensagens criadas nesta sessão entram animadas uma única vez (rolar e voltar não repete). */
const entered = new Set<string>();

const Bubble = memo(function Bubble({ item, pending, technical }: { item: Message; pending: boolean; technical: boolean }) {
  const isUser = item.role === "user";
  const [animate] = useState(() => {
    if (!item.id.startsWith("local-") || entered.has(item.id)) return false;
    entered.add(item.id);
    return true;
  });
  const { before, draft, after } = isUser ? { before: item.content, draft: null, after: "" } : extractDraft(item.content);
  const isDocument = (s: KallySource) => s.kind === "documento" || s.kind === "referencia";
  const internal = item.sources?.filter((s) => s.kind !== "web" && !isDocument(s)) ?? [];
  const documents = item.sources?.filter(isDocument) ?? [];
  const external = item.sources?.filter((s) => s.kind === "web") ?? [];
  return (
    <Animated.View entering={animate ? enter.rise : undefined} style={[isUser ? styles.user : styles.assistant, item.failed && styles.failed]}>
      {isUser ? (
        <>
          <LinearGradient colors={gradients.bubble} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.userFill]} />
          <AppText variant="label" color={colors.violet200} style={styles.userLabel}>Você</AppText>
        </>
      ) : (
        <View style={styles.assistantHead}>
          <KallyMark failed={!!item.failed} />
          <AppText variant="label" color={item.failed ? colors.danger : colors.faint} numberOfLines={1} style={{ flexShrink: 1 }}>
            {item.local ? "Minha Mente" : `Kally${item.dev && technical ? " · dev" : ""}${item.model && technical ? ` · ${item.model}` : ""}${item.mode && item.mode !== "chat" ? ` · ${modeLabel(item.mode) ?? item.mode}` : ""}`}
          </AppText>
        </View>
      )}
      {item.imageUri ? <Image source={{ uri: item.imageUri }} style={styles.bubbleImage} resizeMode="cover" /> : null}
      {item.attachmentName && !item.imageUri ? (
        <View style={styles.attachedName}>
          <Icon name="clip" size={13} color={isUser ? colors.violet200 : colors.violet300} />
          <AppText variant="small" color={isUser ? colors.violet200 : colors.violet300} numberOfLines={1} style={{ flexShrink: 1 }}>{item.attachmentName}</AppText>
        </View>
      ) : null}
      {!item.content ? (
        <View style={styles.typing}><KallyOrbital size={34} state="thinking" /><Shimmer>{item.status ?? (item.mode === "revisar" ? "Revisando…" : "Pensando…")}</Shimmer></View>
      ) : isUser ? (
        <AppText color="#FFFFFF" style={{ lineHeight: 22 }}>{item.content}</AppText>
      ) : (
        <Animated.View entering={animate ? enter.fade : undefined}>
          {before ? <Markdown>{before}</Markdown> : null}
          {draft ? <DraftCard draft={draft} pending={pending} /> : null}
          {after ? <Markdown>{after}</Markdown> : null}
        </Animated.View>
      )}
      {item.review ? <ReviewCard review={item.review} source={item.reviewSource} /> : null}
      {!isUser && !pending && !item.failed && !item.local && !draft && item.content && hasStructure(item.content) ? <ToEditor content={item.content} /> : null}
      {item.stats && technical ? (
        <AppText variant="small" color={colors.faint} style={{ marginTop: space.sm }}>
          {[
            item.stats.pipeline ? (item.stats.pipeline.interpreted ? `interpretou${item.stats.pipeline.competence ? ` (${item.stats.pipeline.competence})` : ""} ${item.stats.pipeline.interpreterSeconds}s` : "direto ao executor") : "",
            item.stats.pipeline?.swapSeconds ? `trocas ${item.stats.pipeline.swapSeconds}s` : "",
            item.stats.pipeline?.queueSeconds ? `fila ${item.stats.pipeline.queueSeconds}s` : "",
            item.stats.pipeline ? `total ${item.stats.pipeline.totalSeconds}s` : "",
            item.stats.loadSeconds ? `carga ${item.stats.loadSeconds}s` : "",
            item.stats.firstTextSeconds != null ? `1º texto ${item.stats.firstTextSeconds}s` : "",
            item.stats.tokensPerSecond ? `${item.stats.tokensPerSecond} tok/s (${item.stats.outputTokens} tokens)` : "",
            item.stats.thinkingChars ? "pensou antes de responder" : "",
            item.stats.memory ? `GPU ${item.stats.memory.vramGB}/${item.stats.memory.totalGB} GB · CPU ${item.stats.memory.cpuGB} GB · ctx ${item.stats.memory.context}` : "",
          ].filter(Boolean).join(" · ")}
        </AppText>
      ) : null}
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
      {documents.length ? (
        <View style={styles.sources}>
          <AppText variant="label" color={colors.faint}>Das suas bases</AppText>
          {documents.map((source) => (
            <AppText key={`${source.kind}-${source.slug}`} variant="small" color={colors.muted}>
              {source.title}
              {source.kind === "referencia" ? " · referência" : " · seu documento"}
            </AppText>
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
      <Animated.View entering={enter.fade} layout={layoutTransition} style={[styles.card, published && styles.cardDone]}>
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
        <Animated.View entering={enter.rise} style={styles.confirm}>
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
    <Sheet visible={visible} onClose={onClose} keyboard>
          <AppText variant="title">Imagens para o pensamento</AppText>
          <AppText variant="small" color={colors.faint} style={{ marginBottom: space.sm }}>Livres, do Wikimedia Commons, com crédito. Nada entra sem você confirmar.</AppText>
          <View style={styles.row2}>
            <TextInput value={q} onChangeText={setQ} onSubmitEditing={() => void search(q)} placeholder="Tema da imagem" accessibilityLabel="Tema da imagem" placeholderTextColor={colors.faint} style={styles.input} />
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
    </Sheet>
  );
}

/**
 * Enviar: círculo em gradiente que acende e cresce com mola quando há o que enviar; apagado e
 * menor quando não há. Ocupado troca a seta pelo indicador, no mesmo lugar.
 */
function SendButton({ disabled, busy, onPress }: { disabled: boolean; busy: boolean; onPress: () => void }) {
  const ready = useSharedValue(disabled ? 0 : 1);
  useEffect(() => {
    ready.value = withSpring(disabled ? 0 : 1, spring.selection);
  }, [disabled, ready]);
  const look = useAnimatedStyle(() => ({ opacity: 0.35 + ready.value * 0.65, transform: [{ scale: 0.9 + ready.value * 0.1 }] }));
  return (
    <Touchable accessibilityRole="button" accessibilityLabel="Enviar" accessibilityState={{ disabled, busy }} disabled={disabled} onPress={onPress} haptic pressScale={0.88} style={[styles.send, elevation.glow, look]}>
      <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.sendFill]} />
      {busy ? (
        <Animated.View key="busy" entering={enter.fade} exiting={exit.fade} style={[StyleSheet.absoluteFill, styles.sendCenter]}>
          <ActivityIndicator color="#FFFFFF" />
        </Animated.View>
      ) : (
        <Animated.View key="send" entering={enter.fade} exiting={exit.fade} style={[StyleSheet.absoluteFill, styles.sendCenter, { transform: [{ rotate: "-45deg" }] }]}>
          <Icon name="send" size={18} color="#FFFFFF" strokeWidth={2.2} />
        </Animated.View>
      )}
    </Touchable>
  );
}

/** Moldura do compositor: cinza quase preto com fio neutro; no foco, o fio acende em roxo e um halo contido aparece (sem salto). */
function ComposerFrame({ focus, children }: { focus: SharedValue<number>; children: ReactNode }) {
  const lit = useAnimatedStyle(() => ({ opacity: focus.value }));
  const halo = useAnimatedStyle(() => ({ shadowOpacity: focus.value * 0.22 }));
  return (
    <Animated.View style={[styles.composerShadow, halo]}>
      <LinearGradient colors={gradients.border} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[StyleSheet.absoluteFill, styles.composerRadius]} />
      <Animated.View style={[StyleSheet.absoluteFill, lit]}>
        <LinearGradient colors={gradients.borderActive} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={[StyleSheet.absoluteFill, styles.composerRadius]} />
      </Animated.View>
      <LinearGradient colors={["rgba(22,21,27,0.98)", "rgba(14,13,18,0.98)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.composerBody}>
        {children}
      </LinearGradient>
    </Animated.View>
  );
}

/**
 * Leva uma resposta com estrutura (tabelas, diagramas, código, títulos) para um pensamento novo
 * no editor, com a formatação intacta: o Markdown vai como está. Só para quem pode escrever.
 */
function ToEditor({ content }: { content: string }) {
  const { permissions } = useCurrentEnvironment();
  if (!permissions.publish && !permissions.manageContent) return null;
  return (
    <Touchable
      accessibilityLabel="Abrir esta resposta no editor como um pensamento novo"
      onPress={() => {
        handOffDraft({ title: "", content });
        router.push({ pathname: "/editor/[id]", params: { id: "novo" } });
      }}
      pressScale={0.96}
      style={styles.toEditor}
    >
      <Icon name="edit" size={13} color={colors.violet300} />
      <AppText variant="small" color={colors.violet300}>Abrir no editor</AppText>
    </Touchable>
  );
}

/** Marca estática da Kally nas mensagens (a órbita animada fica no cabeçalho e no "pensando"). */
function KallyMark({ failed }: { failed: boolean }) {
  return (
    <View style={[styles.mark, failed && styles.markFailed]}>
      <Icon name="kally" size={16} color={failed ? colors.danger : colors.violet300} strokeWidth={1.4} />
    </View>
  );
}

/** Texto do "pensando…" com uma luz que passa por ele, devagar (parado com "reduzir movimento"). */
function Shimmer({ children }: { children: string }) {
  const reduceMotion = useReducedMotion();
  const glow = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    glow.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(glow);
  }, [glow, reduceMotion]);
  const style = useAnimatedStyle(() => ({ opacity: 0.55 + glow.value * 0.45, color: interpolateColor(glow.value, [0, 1], [colors.muted, colors.violet200]) }));
  return <Animated.Text style={[type.uiMedium, style]}>{children}</Animated.Text>;
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
  guest: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, paddingHorizontal: space.lg },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.md },
  envLink: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 24 },
  headerTitle: { fontSize: 28, lineHeight: 32 },
  modes: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: space.xxl },
  headerOrb: { marginRight: space.xs },
  orbitSlot: { width: ORBIT_SIZE, height: ORBIT_SIZE },
  jump: { position: "absolute", bottom: space.md },
  jumpButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, ...elevation.float },
  attachedName: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: space.xs },
  toEditor: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: space.sm, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: tint.selectedBorder, backgroundColor: tint.selected },
  saveToggle: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: colors.violet600, borderColor: colors.violet600 },
  user: { alignSelf: "flex-end", maxWidth: "86%", paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: 22, borderBottomRightRadius: 6 },
  userFill: { borderRadius: 22, borderBottomRightRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(165,139,247,0.3)" },
  userLabel: { fontSize: 10, lineHeight: 14, marginBottom: 2, opacity: 0.8 },
  assistant: { paddingRight: space.sm },
  assistantHead: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.sm },
  failed: { borderLeftWidth: 2, borderLeftColor: colors.danger, paddingLeft: space.md },
  mark: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: tint.selected, borderWidth: StyleSheet.hairlineWidth, borderColor: tint.selectedBorder },
  markFailed: { backgroundColor: "rgba(242,119,122,0.12)", borderColor: "rgba(242,119,122,0.4)" },
  card: { marginTop: space.md, padding: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, backgroundColor: colors.surfaceRaised },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  suggestion: { flexDirection: "row", gap: space.sm, paddingVertical: space.xs },
  sources: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, gap: space.xs },
  link: { flexDirection: "row", alignItems: "center", gap: space.xs },
  note: { paddingHorizontal: space.lg },
  attachment: { flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.md, marginTop: space.xs, padding: space.sm, paddingHorizontal: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.violet700, backgroundColor: colors.glass },
  tool: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.md, paddingVertical: 6, minHeight: 34, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, backgroundColor: "rgba(255,255,255,0.03)" },
  toolOn: { borderColor: tint.selectedBorder, backgroundColor: tint.selected },
  roundTool: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, backgroundColor: "rgba(255,255,255,0.03)" },
  composerWrap: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.md },
  composerShadow: { borderRadius: 26, shadowColor: colors.violet500, shadowRadius: 18, shadowOffset: { width: 0, height: 4 }, elevation: 0 },
  composerRadius: { borderRadius: 26 },
  composerBody: { margin: 1, borderRadius: 25, paddingTop: space.sm, paddingBottom: space.sm, paddingHorizontal: space.sm },
  // Na web, sem o contorno de foco padrão: a moldura do compositor já acende a borda no foco.
  composerInput: { ...type.ui, fontSize: 16, color: colors.text, maxHeight: 150, minHeight: 44, paddingHorizontal: space.sm, paddingTop: 10, paddingBottom: 8, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null) },
  composerBar: { flexDirection: "row", alignItems: "center", gap: 6 },
  toolShrink: { flexShrink: 1, minWidth: 0 },
  sendFill: { borderRadius: 20 },
  input: { ...type.ui, flex: 1, color: colors.text, maxHeight: 140, minHeight: 44, paddingHorizontal: space.md, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.glass },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  sendCenter: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  cardRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  cardDone: { borderColor: colors.violet600 },
  confirm: { marginTop: space.md, padding: space.md, gap: space.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.violet600, backgroundColor: colors.violet950 },
  titleInput: { marginTop: space.sm, minHeight: 40, flex: 0 },
  bodyInput: { marginTop: space.sm, minHeight: 140, maxHeight: 280, flex: 0, textAlignVertical: "top" },
  attachThumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.glass },
  attachIcon: { width: 44, height: 44, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.glass },
  bubbleImage: { width: 180, height: 140, borderRadius: radius.md, marginBottom: space.sm, backgroundColor: colors.glass },
  typing: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 36 },
  reviewBar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm },
  modeRow: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.md },
  modeRowDev: { borderWidth: 1, borderColor: colors.warning },
  devBar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm, backgroundColor: colors.surfaceRaised, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  modeRowOn: { backgroundColor: tint.selected, borderWidth: StyleSheet.hairlineWidth, borderColor: tint.selectedBorder },
  row2: { flexDirection: "row", alignItems: "center", gap: space.sm, justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  thumb: { width: "31%", aspectRatio: 1, borderRadius: radius.sm, overflow: "hidden", backgroundColor: colors.glass },
  preview: { width: "100%", height: 220, borderRadius: radius.md, backgroundColor: colors.glass },
});
