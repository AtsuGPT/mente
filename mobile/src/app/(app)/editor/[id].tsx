import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Switch, TextInput, View, type TextInputInstance } from "react-native";
import { router, Stack, useLocalSearchParams, useNavigation, usePreventRemove } from "expo-router";
import { readingMinutes, stripMarkdown } from "@shared/text";
import { slugify } from "@shared/slug";
import { ApiError } from "@/lib/api";
import { useCurrentEnvironment } from "@/lib/environment";
import { formatNumber } from "@/lib/format";
import type { Category, FieldErrors, PostStatus } from "@/lib/types";
import { pickImage, uploadablePart } from "@/lib/upload";
import { Markdown } from "@/components/markdown/markdown";
import { AppText, Button, Chip, SectionLabel, TextField, Touchable } from "@/components/ui/primitives";
import { colors, fonts, radius, space } from "@/theme/tokens";
import { useContainer, useLayout } from "@/theme/layout";
import { takeDraft } from "@/lib/draft-handoff";
import { blockAt, type StructuredBlock } from "@/lib/structured";
import { DiagramEditorSheet, TableEditorSheet } from "@/components/editor/structure-sheets";
import { Icon } from "@/components/ui/icon";
import { KeyboardScreen } from "@/components/keyboard-screen";

type Intent = "save" | "publish" | "unpublish";
type Selection = { start: number; end: number };

/** Barra de formatação: insere a mesma sintaxe Markdown que o editor do site grava. */
const tools: { label: string; hint: string; apply: (text: string, sel: Selection) => { text: string; cursor: number } }[] = [
  { label: "B", hint: "Negrito", apply: (t, s) => wrap(t, s, "**", "**", "texto") },
  { label: "I", hint: "Itálico", apply: (t, s) => wrap(t, s, "_", "_", "texto") },
  { label: "H2", hint: "Título", apply: (t, s) => prefixLines(t, s, "## ") },
  { label: "H3", hint: "Subtítulo", apply: (t, s) => prefixLines(t, s, "### ") },
  { label: "•", hint: "Lista", apply: (t, s) => prefixLines(t, s, "- ") },
  { label: "1.", hint: "Lista numerada", apply: (t, s) => prefixLines(t, s, "1. ") },
  { label: "❝", hint: "Citação", apply: (t, s) => prefixLines(t, s, "> ") },
  { label: "Link", hint: "Link", apply: (t, s) => wrap(t, s, "[", "](https://)", "texto do link") },
  { label: "</>", hint: "Código", apply: (t, s) => wrap(t, s, "`", "`", "código") },
  { label: "—", hint: "Divisória", apply: (t, s) => insertBlock(t, s, "---") },
  { label: "Detalhes", hint: "Bloco recolhível", apply: (t, s) => insertBlock(t, s, ":::details[Título]\n\nConteúdo\n\n:::") },
];

function wrap(text: string, sel: Selection, before: string, after: string, placeholder: string) {
  const selected = text.slice(sel.start, sel.end) || placeholder;
  const next = text.slice(0, sel.start) + before + selected + after + text.slice(sel.end);
  return { text: next, cursor: sel.start + before.length + selected.length + after.length };
}

function prefixLines(text: string, sel: Selection, prefix: string) {
  const lineStart = text.lastIndexOf("\n", sel.start - 1) + 1;
  const block = text.slice(lineStart, sel.end);
  const prefixed = block.split("\n").map((line) => (line.startsWith(prefix) ? line : prefix + line)).join("\n");
  return { text: text.slice(0, lineStart) + prefixed + text.slice(sel.end), cursor: lineStart + prefixed.length };
}

function insertBlock(text: string, sel: Selection, block: string) {
  const before = text.slice(0, sel.start).replace(/\s*$/, "");
  const after = text.slice(sel.end).replace(/^\s*/, "");
  const head = before ? `${before}\n\n` : "";
  const next = `${head}${block}\n\n${after}`;
  return { text: next, cursor: head.length + block.length + 2 };
}

export default function EditorScreen() {
  const { api } = useCurrentEnvironment();
  const container = useContainer("reading");
  const { height } = useLayout();
  // Com altura máxima o campo rola por dentro e o cursor continua acima do teclado;
  // em telas baixas a altura mínima cede para o campo não passar da janela.
  const contentMax = Math.max(200, Math.round(height * 0.5));
  const contentHeight = { maxHeight: contentMax, minHeight: Math.min(320, contentMax) };
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "novo";
  // Rascunho vindo da Kally (só ao abrir um novo pensamento).
  const [handoff] = useState(() => (isNew ? takeDraft() : null));
  // Revisão da Kally aplicada a um pensamento existente: substitui o texto depois de carregar.
  const [revised] = useState(() => (isNew ? null : takeDraft(id)));
  const navigation = useNavigation();
  const contentRef = useRef<TextInputInstance>(null);

  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [number, setNumber] = useState<number | null>(null);
  const [status, setStatus] = useState<PostStatus>("DRAFT");
  const [originalSlug, setOriginalSlug] = useState("");

  const [title, setTitle] = useState(handoff?.title ?? "");
  const [slug, setSlug] = useState(handoff?.title ? slugify(handoff.title) : "");
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [content, setContent] = useState(handoff?.content ?? "");
  const [isPrivate, setIsPrivate] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [publishedLocal, setPublishedLocal] = useState("");
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const [tab, setTab] = useState<"write" | "preview">("write");
  // Tabela ou diagrama em edição: o bloco sob o cursor (editar no lugar) ou nenhum (inserir).
  const [structure, setStructure] = useState<{ kind: "table" | "diagram"; block: StructuredBlock | null } | null>(null);
  const underCursor = useMemo(() => blockAt(content, selection.start), [content, selection.start]);

  const [dirty, setDirty] = useState(!!handoff);
  const [saving, setSaving] = useState<Intent | "delete" | "image" | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [cats, post] = await Promise.all([api.manageCategories(), isNew ? null : api.managedPost(id)]);
      setCategories(cats.categories);
      if (post) {
        const p = post.post;
        setNumber(p.number);
        setStatus(p.status);
        setTitle(p.title);
        setSlug(p.slug);
        setOriginalSlug(p.slug);
        setContent(revised?.content ?? p.content);
        if (revised) setDirty(true);
        setIsPrivate(p.private);
        setSelected(p.categories.map((c) => c.id));
        setPublishedLocal(p.publishedAtLocal.replace("T", " "));
      }
      setLoadError(null);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Não foi possível abrir o editor.");
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => {
    void load();
  }, [load]);

  // Como no site: avisa antes de sair com alterações não salvas. "Descartar" desliga o aviso
  // e só depois (já sem a proteção ativa) executa a saída pedida; reenviar a ação com a
  // proteção ainda ligada fazia o aviso voltar sem fechar o editor.
  const [pendingLeave, setPendingLeave] = useState<{ action: Parameters<typeof navigation.dispatch>[0] } | null>(null);
  usePreventRemove(dirty && !saving, ({ data }) => {
    const discard = () => {
      setDirty(false);
      setPendingLeave({ action: data.action });
    };
    // Na web o Alert do React Native não aparece: usa a confirmação do navegador.
    if (Platform.OS === "web") {
      if (window.confirm("Descartar alterações? Há mudanças que ainda não foram salvas.")) discard();
      return;
    }
    Alert.alert("Descartar alterações?", "Há mudanças que ainda não foram salvas.", [
      { text: "Continuar editando", style: "cancel" },
      { text: "Descartar", style: "destructive", onPress: discard },
    ]);
  });
  useEffect(() => {
    if (!pendingLeave || dirty) return;
    setPendingLeave(null);
    navigation.dispatch(pendingLeave.action);
  }, [pendingLeave, dirty, navigation]);

  const touch = () => {
    setDirty(true);
    setMessage(null);
  };

  function applyTool(apply: (typeof tools)[number]["apply"]) {
    const result = apply(content, selection);
    setContent(result.text);
    setSelection({ start: result.cursor, end: result.cursor });
    touch();
    setTimeout(() => contentRef.current?.focus(), 0);
  }

  function openStructure(kind: "table" | "diagram") {
    setStructure({ kind, block: underCursor?.kind === kind ? underCursor : null });
  }

  function saveStructure(markdown: string) {
    const block = structure?.block;
    const result = block
      ? { text: content.slice(0, block.start) + markdown + content.slice(block.end), cursor: block.start + markdown.length }
      : insertBlock(content, selection, markdown);
    setContent(result.text);
    setSelection({ start: result.cursor, end: result.cursor });
    setStructure(null);
    touch();
  }

  async function insertImage() {
    setMessage(null);
    let asset;
    try {
      asset = await pickImage();
    } catch (cause) {
      setMessage({ tone: "error", text: cause instanceof Error ? cause.message : "Não foi possível abrir a galeria." });
      return;
    }
    if (!asset) return;
    setSaving("image");
    try {
      const { part, name } = await uploadablePart(asset);
      const form = new FormData();
      form.append("image", part, name);
      const { src } = await api.uploadImage(form);
      // Mesma regra do editor do site: até 960 px de largura, preservando a proporção.
      const scale = asset.width ? Math.min(1, 960 / asset.width) : 1;
      const width = Math.max(1, Math.round((asset.width || 960) * scale));
      const height = Math.max(1, Math.round((asset.height || 720) * scale));
      const alt = name.replace(/\.[^.]+$/, "").replace(/[[\]]/g, "");
      const result = insertBlock(content, selection, `![${alt}](${src}?mm-width=${width}&mm-height=${height})`);
      setContent(result.text);
      setSelection({ start: result.cursor, end: result.cursor });
      touch();
    } catch (cause) {
      setMessage({ tone: "error", text: cause instanceof Error ? cause.message : "Não foi possível enviar a imagem." });
    } finally {
      setSaving(null);
    }
  }

  async function submit(intent: Intent) {
    if (saving) return;
    setSaving(intent);
    setErrors({});
    setMessage(null);
    const form = new FormData();
    form.append("title", title);
    form.append("slug", slug);
    form.append("content", content);
    if (isPrivate) form.append("private", "on");
    for (const categoryId of selected) form.append("categoryIds", categoryId);
    form.append("publishedAt", publishedLocal.trim().replace(" ", "T"));
    form.append("intent", intent);
    try {
      if (isNew) {
        const { id: createdId } = await api.createPost(form);
        setDirty(false);
        router.replace({ pathname: "/editor/[id]", params: { id: createdId } });
        return;
      }
      await api.updatePost(id, form);
      setDirty(false);
      setOriginalSlug(slug);
      if (intent === "publish") setStatus("PUBLISHED");
      if (intent === "unpublish") setStatus("DRAFT");
      setMessage({ tone: "ok", text: intent === "publish" ? "Pensamento publicado." : intent === "unpublish" ? "Voltou para rascunho." : "Alterações salvas." });
    } catch (cause) {
      if (cause instanceof ApiError && cause.fieldErrors) setErrors(cause.fieldErrors);
      setMessage({ tone: "error", text: cause instanceof Error ? cause.message : "Não foi possível salvar." });
    } finally {
      setSaving(null);
    }
  }

  function confirmDelete() {
    Alert.alert("Excluir este pensamento?", "Esta ação não pode ser desfeita.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          setSaving("delete");
          try {
            await api.deletePost(id);
            setDirty(false);
            router.back();
          } catch (cause) {
            setMessage({ tone: "error", text: cause instanceof Error ? cause.message : "Não foi possível excluir." });
            setSaving(null);
          }
        },
      },
    ]);
  }

  const words = stripMarkdown(content).split(/\s+/).filter(Boolean).length;
  const published = status === "PUBLISHED";
  const err = (field: string) => errors[field]?.[0];

  if (loading || loadError) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl }}>
        <Stack.Screen options={{ title: "" }} />
        {loadError ? (
          <>
            <AppText color={colors.danger} style={{ textAlign: "center" }}>{loadError}</AppText>
            <Button label="Tentar de novo" variant="secondary" compact onPress={() => { setLoading(true); void load(); }} style={{ marginTop: space.lg }} />
          </>
        ) : (
          <AppText color={colors.muted}>Abrindo…</AppText>
        )}
      </View>
    );
  }

  return (
    <KeyboardScreen header>
      <Stack.Screen options={{ title: isNew ? "Novo pensamento" : number ? `Editar · Nº ${formatNumber(number)}` : "Editar" }} />
      <ScrollView contentContainerStyle={[styles.content, container]} keyboardShouldPersistTaps="handled">
        <View style={styles.statusRow}>
          <AppText variant="label" color={published ? colors.success : colors.warning}>{isNew ? "Novo" : published ? "Publicado" : "Rascunho"}</AppText>
          <AppText variant="label" color={colors.faint}>{words} palavras · {readingMinutes(content)} min</AppText>
        </View>

        <TextField
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            if (!slugTouched) setSlug(slugify(value));
            touch();
          }}
          placeholder="Título do pensamento"
          error={err("title")}
          style={styles.titleInput}
          multiline
          maxLength={200}
        />

        <View style={styles.tabs}>
          {(["write", "preview"] as const).map((t) => (
            <Touchable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
              <AppText variant="label" color={tab === t ? colors.text : colors.faint}>{t === "write" ? "Escrever" : "Prévia"}</AppText>
            </Touchable>
          ))}
        </View>

        {tab === "write" ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.toolbar}>
              {tools.map((tool) => (
                <Touchable key={tool.hint} accessibilityLabel={tool.hint} onPress={() => applyTool(tool.apply)} style={styles.tool}>
                  <AppText variant="small" style={{ fontFamily: tool.label === "B" ? fonts.sansSemibold : tool.label === "I" ? fonts.serifItalic : fonts.sansMedium }}>{tool.label}</AppText>
                </Touchable>
              ))}
              <Touchable accessibilityLabel={underCursor?.kind === "table" ? "Editar a tabela" : "Inserir tabela"} onPress={() => openStructure("table")} style={[styles.tool, styles.toolRow, underCursor?.kind === "table" && styles.toolAccent]}>
                <Icon name="table" size={15} color={colors.violet300} />
                <AppText variant="small" style={{ fontFamily: fonts.sansMedium }}>{underCursor?.kind === "table" ? "Editar tabela" : "Tabela"}</AppText>
              </Touchable>
              <Touchable accessibilityLabel={underCursor?.kind === "diagram" ? "Editar o diagrama" : "Inserir diagrama"} onPress={() => openStructure("diagram")} style={[styles.tool, styles.toolRow, underCursor?.kind === "diagram" && styles.toolAccent]}>
                <Icon name="flow" size={15} color={colors.violet300} />
                <AppText variant="small" style={{ fontFamily: fonts.sansMedium }}>{underCursor?.kind === "diagram" ? "Editar diagrama" : "Diagrama"}</AppText>
              </Touchable>
              <Touchable accessibilityLabel="Imagem" onPress={() => void insertImage()} disabled={saving === "image"} style={[styles.tool, styles.toolAccent]}>
                <AppText variant="small" color={colors.violet200} style={{ fontFamily: fonts.sansMedium }}>{saving === "image" ? "Enviando…" : "Imagem"}</AppText>
              </Touchable>
            </ScrollView>
            <TextInput
              ref={contentRef}
              value={content}
              onChangeText={(value) => {
                setContent(value);
                touch();
              }}
              onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
              placeholder="Escreva em Markdown. Use a barra acima para formatar."
              placeholderTextColor={colors.faint}
              selectionColor={colors.violet400}
              multiline
              textAlignVertical="top"
              autoCorrect
              style={[styles.contentInput, contentHeight, err("content") ? { borderColor: colors.danger } : null]}
            />
            {err("content") ? <AppText variant="small" color={colors.danger}>{err("content")}</AppText> : null}
          </>
        ) : (
          <View style={styles.preview}>
            {content.trim() ? <Markdown>{content}</Markdown> : <AppText color={colors.faint}>Nada para mostrar ainda.</AppText>}
            <AppText variant="small" color={colors.faint}>Prévia do texto em edição. Nada foi publicado.</AppText>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.privateRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="uiMedium">Post privado</AppText>
              <AppText variant="small" color={colors.muted}>Só participantes do ambiente veem; visitantes, não.</AppText>
            </View>
            <Switch value={isPrivate} onValueChange={(v) => { setIsPrivate(v); touch(); }} trackColor={{ true: colors.violet600, false: colors.lineStrong }} thumbColor={colors.text} />
          </View>
        </View>

        <View style={styles.section}>
          <SectionLabel>Categorias</SectionLabel>
          <View style={styles.chips}>
            {categories.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                dot={c.color}
                selected={selected.includes(c.id)}
                onPress={() => {
                  setSelected((current) => (current.includes(c.id) ? current.filter((x) => x !== c.id) : [...current, c.id]));
                  touch();
                }}
              />
            ))}
          </View>
        </View>

        <TextField
          label="Endereço"
          value={slug}
          onChangeText={(value) => {
            setSlug(value);
            setSlugTouched(true);
            touch();
          }}
          autoCapitalize="none"
          autoCorrect={false}
          error={err("slug")}
          hint={published && originalSlug && slug !== originalSlug ? "Atenção: o link antigo deste pensamento deixará de funcionar." : `/post/${slug || "…"}`}
          maxLength={120}
        />

        <TextField
          label="Data de publicação"
          value={publishedLocal}
          onChangeText={(value) => {
            setPublishedLocal(value);
            touch();
          }}
          placeholder="AAAA-MM-DD HH:mm"
          keyboardType="numbers-and-punctuation"
          error={err("publishedAt")}
          hint="Horário de Brasília. Vazio ao publicar = agora. Uma data futura agenda o pensamento."
          maxLength={16}
        />

        {message ? (
          <View style={[styles.message, message.tone === "error" ? styles.messageError : styles.messageOk]} accessibilityRole="alert">
            <AppText variant="small" color={message.tone === "error" ? colors.danger : colors.success}>{message.text}</AppText>
          </View>
        ) : null}

        <View style={{ gap: space.sm }}>
          {published ? (
            <>
              <Button label="Salvar alterações" loading={saving === "save"} disabled={!!saving} onPress={() => void submit("save")} />
              <Button label="Voltar a rascunho" variant="secondary" loading={saving === "unpublish"} disabled={!!saving} onPress={() => void submit("unpublish")} />
            </>
          ) : (
            <>
              <Button label="Publicar" icon="send" loading={saving === "publish"} disabled={!!saving} onPress={() => void submit("publish")} />
              <Button label="Salvar rascunho" variant="secondary" loading={saving === "save"} disabled={!!saving} onPress={() => void submit("save")} />
            </>
          )}
          {!isNew ? <Button label="Excluir pensamento" icon="trash" variant="danger" disabled={!!saving} loading={saving === "delete"} onPress={confirmDelete} style={{ marginTop: space.lg }} /> : null}
        </View>
      </ScrollView>
      <TableEditorSheet
        visible={structure?.kind === "table"}
        initial={structure?.block?.kind === "table" ? structure.block.table : null}
        onClose={() => setStructure(null)}
        onSave={saveStructure}
      />
      <DiagramEditorSheet
        visible={structure?.kind === "diagram"}
        initial={structure?.block?.kind === "diagram" ? structure.block.source : null}
        onClose={() => setStructure(null)}
        onSave={saveStructure}
      />
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxxl * 2 },
  statusRow: { flexDirection: "row", justifyContent: "space-between" },
  titleInput: { fontFamily: fonts.serif, fontSize: 26, lineHeight: 32, minHeight: 56 },
  tabs: { flexDirection: "row", alignSelf: "flex-start", gap: 4, padding: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.glass },
  tab: { paddingVertical: space.sm, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: "transparent" },
  tabActive: { backgroundColor: "rgba(132,97,240,0.16)", borderColor: "rgba(165,139,247,0.38)" },
  toolbar: { gap: space.xs },
  tool: { minWidth: 44, height: 44, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.glass, alignItems: "center", justifyContent: "center" },
  toolRow: { flexDirection: "row", gap: 6 },
  toolAccent: { borderColor: "rgba(165,139,247,0.38)", backgroundColor: "rgba(132,97,240,0.16)" },
  contentInput: {
    fontFamily: fonts.serif,
    fontSize: 17,
    lineHeight: 26,
    color: colors.text,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.glass,
  },
  preview: { padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.glass, gap: space.md },
  section: { gap: space.md },
  privateRow: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.glass },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  message: { padding: space.md, borderRadius: radius.md, borderWidth: 1 },
  messageError: { borderColor: "#5A2228", backgroundColor: colors.dangerSoft },
  messageOk: { borderColor: "#1F4A34", backgroundColor: "#0E2219" },
});
