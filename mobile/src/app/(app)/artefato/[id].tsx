import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, Share, StyleSheet, Switch, TextInput, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/lib/api";
import { Alert } from "@/lib/alert";
import { ARTIFACT_KINDS, embedBlock, KIND_INFO, kindOf, TEMPLATES, type ArtifactKind } from "@/lib/artifact";
import { handOffDraft } from "@/lib/draft-handoff";
import { useCurrentEnvironment } from "@/lib/environment";
import { feedback } from "@/lib/feedback";
import { formatDateShort } from "@/lib/format";
import { chooseFileFormat, saveArtifactFile } from "@/lib/artifact-file";
import type { ArtifactFull, ArtifactVersionMeta } from "@/lib/types";
import { ArtifactFullscreen, ArtifactPreview } from "@/components/artifact/artifact-view";
import { AppText, Button, Chip, StateView, TextField, Touchable } from "@/components/ui/primitives";
import { Icon, type IconName } from "@/components/ui/icon";
import { colors, radius, space, tint } from "@/theme/tokens";
import { useContainer, useLayout } from "@/theme/layout";

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, SFMono-Regular, Menlo, monospace" });

const ORIGIN_LABEL: Record<string, string> = { kally: "Kally", manual: "à mão", restauracao: "restaurada", duplicacao: "cópia" };

/**
 * Página de um artefato: ele funcionando, os controles (tela cheia, editar com a Kally, código, favoritar, duplicar,
 * compartilhar, usar num pensamento), os detalhes editáveis e o histórico de versões (ver e restaurar).
 * Com id "novo": criar à mão, a partir de um modelo de cada tipo.
 */
export default function ArtifactScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return id === "novo" ? <NewArtifact /> : <ArtifactPage id={id} />;
}

function ActionButton({ icon, label, onPress, active, danger }: { icon: IconName; label: string; onPress: () => void; active?: boolean; danger?: boolean }) {
  return (
    <Touchable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} haptic pressScale={0.96} style={[styles.action, active && styles.actionOn]}>
      <Icon name={icon} size={16} color={danger ? colors.danger : active ? colors.violet200 : colors.muted} />
      <AppText variant="small" color={danger ? colors.danger : active ? colors.violet200 : colors.text}>{label}</AppText>
    </Touchable>
  );
}

function CodeEditor({ value, onChange, editable = true }: { value: string; onChange?: (v: string) => void; editable?: boolean }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      editable={editable}
      multiline
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      textAlignVertical="top"
      accessibilityLabel="Código do artefato"
      style={styles.code}
    />
  );
}

function ArtifactPage({ id }: { id: string }) {
  const insets = useSafeAreaInsets();
  const container = useContainer("content");
  const { height } = useLayout();
  const { api, environment } = useCurrentEnvironment();
  const [artifact, setArtifact] = useState<ArtifactFull | null>(null);
  const [versions, setVersions] = useState<ArtifactVersionMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [panel, setPanel] = useState<"none" | "code" | "versions" | "details">("none");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<{ number: number; source: string } | null>(null);
  const [details, setDetails] = useState({ title: "", description: "", category: "", private: false });
  const [runErrors, setRunErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await api.artifact(id);
      setArtifact(r.artifact);
      setVersions(r.versions);
      setCode(r.artifact.source);
      setDetails({ title: r.artifact.title, description: r.artifact.description, category: r.artifact.category, private: r.artifact.private });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não consegui abrir o artefato.");
    }
  }, [api, id]);
  useEffect(() => void load(), [load]);

  if (!artifact) {
    return (
      <View style={{ flex: 1, paddingTop: space.xxl }}>
        <Stack.Screen options={{ title: "Artefato" }} />
        <StateView loading={!error} error={error} onRetry={() => void load()} />
      </View>
    );
  }

  const kind = kindOf(artifact.kind);
  const info = KIND_INFO[kind];
  const shownSource = viewing ? viewing.source : panel === "code" ? code : artifact.source;
  const dirty = code !== artifact.source;

  const fail = (cause: unknown) => {
    const details = cause instanceof ApiError ? cause.details : undefined;
    Alert.alert("Não deu certo", [cause instanceof Error ? cause.message : "Tente de novo.", ...(details ?? [])].join("\n"));
  };

  const saveVersion = async () => {
    setSaving(true);
    try {
      if (artifact.canEdit) {
        const r = await api.addArtifactVersion(artifact.id, { source: code, note: note.trim() || "Edição do código" });
        feedback.success();
        setNote("");
        await load();
        if (r.warnings.length) Alert.alert(`Versão ${r.version} salva`, `Atenção: ${r.warnings.join(" ")}`);
      } else {
        // Sem permissão para editar este: a mudança vira um artefato novo, seu.
        const r = await api.createArtifact({ title: `${artifact.title} (minha versão)`, kind: artifact.kind, description: artifact.description, category: artifact.category, format: artifact.format, source: code, note: note.trim() || `A partir de "${artifact.title}"` });
        feedback.success();
        router.replace({ pathname: "/artefato/[id]", params: { id: r.id } });
      }
    } catch (cause) {
      fail(cause);
    } finally {
      setSaving(false);
    }
  };

  const toggleFavorite = async () => {
    const on = !artifact.favorite;
    setArtifact({ ...artifact, favorite: on });
    feedback.select();
    api.setArtifactFavorite(artifact.id, on).catch(() => setArtifact((a) => (a ? { ...a, favorite: !on } : a)));
  };

  const duplicate = async () => {
    try {
      const r = await api.duplicateArtifact(artifact.id);
      feedback.success();
      router.push({ pathname: "/artefato/[id]", params: { id: r.id } });
    } catch (cause) {
      fail(cause);
    }
  };

  const download = async () => {
    const format = await chooseFileFormat(artifact.format === "markdown");
    if (!format) return;
    setSaving(true);
    try {
      await saveArtifactFile(environment.id, format, { id: artifact.id });
      feedback.success();
    } catch (cause) {
      fail(cause);
    } finally {
      setSaving(false);
    }
  };

  const share = () => {
    void Share.share({ message: `«${artifact.title}» · ${info.label} na Mente (ambiente ${environment.name}).${artifact.description ? `\n${artifact.description}` : ""}\nAbra na aba Artefatos do ambiente.` }).catch(() => undefined);
  };

  const useInPost = () => {
    handOffDraft({ title: artifact.title, content: `${artifact.description ? `${artifact.description}\n\n` : ""}${embedBlock(artifact)}\n` });
    router.push({ pathname: "/editor/[id]", params: { id: "novo" } });
  };

  const askKally = () => router.push({ pathname: "/perguntar", params: { artefato: artifact.id } });

  const remove = () =>
    Alert.alert("Excluir artefato?", `«${artifact.title}» e as ${versions.length} versões dele serão apagados para todos do ambiente. Isso não pode ser desfeito.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteArtifact(artifact.id);
            router.back();
          } catch (cause) {
            fail(cause);
          }
        },
      },
    ]);

  const saveDetails = async () => {
    setSaving(true);
    try {
      await api.updateArtifact(artifact.id, details);
      feedback.success();
      setPanel("none");
      await load();
    } catch (cause) {
      fail(cause);
    } finally {
      setSaving(false);
    }
  };

  const restore = (n: number) =>
    Alert.alert(`Restaurar a versão ${n}?`, "Ela volta como uma versão nova; as outras continuam no histórico.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Restaurar",
        onPress: async () => {
          try {
            await api.restoreArtifact(artifact.id, n);
            feedback.success();
            setViewing(null);
            await load();
          } catch (cause) {
            fail(cause);
          }
        },
      },
    ]);

  const viewVersion = async (n: number) => {
    if (n === artifact.version) return setViewing(null);
    try {
      const r = await api.artifactVersion(artifact.id, n);
      setViewing({ number: n, source: r.version.source });
    } catch (cause) {
      fail(cause);
    }
  };

  return (
    <ScrollView contentContainerStyle={[{ paddingTop: space.lg, paddingBottom: insets.bottom + space.xxxl, gap: space.lg }, container]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: info.label }} />
      <View style={styles.head}>
        <View style={[styles.badge, { backgroundColor: `${info.color}1F`, borderColor: `${info.color}55` }]}>
          <Icon name={info.icon} size={22} color={info.color} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="title">{artifact.title}</AppText>
          <AppText variant="small" color={colors.faint}>
            {info.label}
            {artifact.category ? ` · ${artifact.category}` : ""} · v{artifact.version} · {artifact.author ? (artifact.author.isMe ? "você" : artifact.author.name) : "conta removida"} · {formatDateShort(artifact.updatedAt)}
            {artifact.private ? " · privado" : ""}
          </AppText>
        </View>
      </View>
      {artifact.description ? <AppText variant="ui" color={colors.muted}>{artifact.description}</AppText> : null}

      {viewing ? (
        <View style={styles.viewing}>
          <AppText variant="small" color={colors.violet200} style={{ flex: 1 }}>Vendo a versão {viewing.number} (a atual é a {artifact.version}).</AppText>
          {artifact.canEdit ? <Button label="Restaurar" compact onPress={() => restore(viewing.number)} /> : null}
          <Button label="Voltar à atual" variant="ghost" compact onPress={() => setViewing(null)} />
        </View>
      ) : null}

      <View style={styles.frame}>
        <ArtifactPreview key={`${viewing?.number ?? "atual"}-${panel === "code" ? "codigo" : "v"}`} source={shownSource} format={artifact.format} maxHeight={Math.round(height * 0.7)} minHeight={220} onErrors={setRunErrors} />
      </View>

      <View style={styles.actions}>
        <ActionButton icon="expand" label="Tela cheia" onPress={() => setFull(true)} />
        <ActionButton icon="kally" label={runErrors.length ? "Pedir correção à Kally" : "Editar com a Kally"} onPress={askKally} />
        <ActionButton icon="code" label="Código" active={panel === "code"} onPress={() => setPanel(panel === "code" ? "none" : "code")} />
        <ActionButton icon="clock" label={`Versões (${versions.length})`} active={panel === "versions"} onPress={() => setPanel(panel === "versions" ? "none" : "versions")} />
        {artifact.canFavorite ? <ActionButton icon={artifact.favorite ? "starFilled" : "star"} label={artifact.favorite ? "Favorito" : "Favoritar"} active={artifact.favorite} onPress={toggleFavorite} /> : null}
        {artifact.canDuplicate ? <ActionButton icon="copy" label="Duplicar" onPress={duplicate} /> : null}
        {artifact.canDuplicate ? <ActionButton icon="doc" label="Usar num pensamento" onPress={useInPost} /> : null}
        <ActionButton icon="doc" label={saving ? "Gerando…" : "Baixar (PDF e outros)"} onPress={() => void download()} />
        <ActionButton icon="share" label="Compartilhar" onPress={share} />
        {artifact.canEdit ? <ActionButton icon="edit" label="Detalhes" active={panel === "details"} onPress={() => setPanel(panel === "details" ? "none" : "details")} /> : null}
        {artifact.canEdit ? <ActionButton icon="trash" label="Excluir" danger onPress={remove} /> : null}
      </View>

      {panel === "code" ? (
        <View style={styles.panel}>
          <AppText variant="label" color={colors.faint}>Código ({artifact.format === "markdown" ? "Markdown" : "HTML, CSS e JavaScript"}) · a prévia acima acompanha</AppText>
          <CodeEditor value={code} onChange={setCode} />
          <TextField value={note} onChangeText={setNote} placeholder="O que mudou (opcional)" />
          <View style={styles.row}>
            <Button label={artifact.canEdit ? `Salvar como versão ${artifact.version + 1}` : "Salvar como um artefato meu"} onPress={saveVersion} loading={saving} disabled={!dirty} style={{ flex: 1 }} />
            <Button label="Desfazer" variant="secondary" onPress={() => setCode(artifact.source)} disabled={!dirty} />
          </View>
        </View>
      ) : null}

      {panel === "versions" ? (
        <View style={styles.panel}>
          {versions.map((v) => (
            <View key={v.number} style={[styles.version, viewing?.number === v.number && styles.versionOn]}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="uiMedium">
                  Versão {v.number}
                  {v.number === artifact.version ? " · atual" : ""}
                </AppText>
                <AppText variant="small" color={colors.faint} numberOfLines={2}>
                  {v.note || "Sem nota"} · {ORIGIN_LABEL[v.origin] ?? v.origin}
                  {v.author ? ` · ${v.author}` : ""} · {formatDateShort(v.createdAt)}
                </AppText>
              </View>
              {v.number !== artifact.version ? <Button label="Ver" variant="ghost" compact onPress={() => void viewVersion(v.number)} /> : null}
              {v.number !== artifact.version && artifact.canEdit ? <Button label="Restaurar" variant="secondary" compact onPress={() => restore(v.number)} /> : null}
            </View>
          ))}
        </View>
      ) : null}

      {panel === "details" ? (
        <View style={styles.panel}>
          <TextField label="Título" value={details.title} onChangeText={(title) => setDetails({ ...details, title })} maxLength={120} />
          <TextField label="Descrição" value={details.description} onChangeText={(description) => setDetails({ ...details, description })} multiline maxLength={400} />
          <TextField label="Pasta" value={details.category} onChangeText={(category) => setDetails({ ...details, category })} placeholder="Física, Cálculo, Programação…" maxLength={40} />
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="uiMedium">Privado</AppText>
              <AppText variant="small" color={colors.faint}>Só quem pode ver os privados do ambiente (e você).</AppText>
            </View>
            <Switch value={details.private} onValueChange={(v) => setDetails({ ...details, private: v })} trackColor={{ true: colors.violet600, false: colors.lineStrong }} />
          </View>
          <Button label="Salvar detalhes" onPress={saveDetails} loading={saving} />
        </View>
      ) : null}

      <ArtifactFullscreen visible={full} onClose={() => setFull(false)} title={artifact.title} kind={kind} source={shownSource} format={artifact.format} />
    </ScrollView>
  );
}

function NewArtifact() {
  const insets = useSafeAreaInsets();
  const container = useContainer("content");
  const { api, permissions } = useCurrentEnvironment();
  const [kind, setKind] = useState<ArtifactKind>("simulador");
  const template = TEMPLATES[kind];
  const [title, setTitle] = useState(template.title);
  const [description, setDescription] = useState(template.description);
  const [category, setCategory] = useState("");
  const [code, setCode] = useState(template.source);
  const [saving, setSaving] = useState(false);
  const format = kind === "documento" ? "markdown" : "html";
  const [preview, setPreview] = useState(code);
  // A prévia acompanha o código com uma pequena pausa (não recarrega a cada letra).
  useEffect(() => {
    const timer = setTimeout(() => setPreview(code), 600);
    return () => clearTimeout(timer);
  }, [code]);

  const choose = (k: ArtifactKind) => {
    setKind(k);
    setTitle(TEMPLATES[k].title);
    setDescription(TEMPLATES[k].description);
    setCode(TEMPLATES[k].source);
    feedback.select();
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.createArtifact({ title, kind, description, category, format, source: code, note: "Criado à mão" });
      feedback.success();
      router.replace({ pathname: "/artefato/[id]", params: { id: r.id } });
    } catch (cause) {
      const details = cause instanceof ApiError ? cause.details : undefined;
      Alert.alert("Não deu para salvar", [cause instanceof Error ? cause.message : "Tente de novo.", ...(details ?? [])].join("\n"));
    } finally {
      setSaving(false);
    }
  };

  const kinds = useMemo(() => ARTIFACT_KINDS.map((k) => ({ k, ...KIND_INFO[k] })), []);
  if (!permissions.publish) {
    return (
      <View style={{ flex: 1, paddingTop: space.xxl }}>
        <Stack.Screen options={{ title: "Novo artefato" }} />
        <StateView error="Você não pode criar artefatos neste ambiente." />
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={[{ paddingTop: space.lg, paddingBottom: insets.bottom + space.xxxl, gap: space.lg }, container]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "Novo artefato" }} />
      <AppText variant="ui" color={colors.muted}>Escolha um tipo para começar de um modelo pronto e edite o código. Ou peça à Kally, que escreve por você.</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {kinds.map(({ k, label, color }) => (
          <Chip key={k} label={label} dot={color} selected={kind === k} onPress={() => choose(k)} />
        ))}
      </ScrollView>
      <TextField label="Título" value={title} onChangeText={setTitle} maxLength={120} />
      <TextField label="Descrição" value={description} onChangeText={setDescription} maxLength={400} />
      <TextField label="Pasta" value={category} onChangeText={setCategory} placeholder="Física, Cálculo, Programação…" maxLength={40} />
      <View style={styles.frame}>
        <ArtifactPreview source={preview} format={format} maxHeight={480} />
      </View>
      <AppText variant="label" color={colors.faint}>Código</AppText>
      <CodeEditor value={code} onChange={setCode} />
      <Button label="Salvar na biblioteca" icon="check" onPress={save} loading={saving} disabled={!title.trim() || !code.trim()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", gap: space.md, alignItems: "center" },
  badge: { width: 46, height: 46, borderRadius: radius.md, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  frame: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, backgroundColor: colors.bg, overflow: "hidden" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  action: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, minHeight: 38, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, backgroundColor: colors.surface },
  actionOn: { borderColor: tint.selectedBorder, backgroundColor: tint.selected },
  panel: { gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong },
  row: { flexDirection: "row", gap: space.sm },
  code: { minHeight: 260, maxHeight: 520, fontFamily: mono, fontSize: 12.5, lineHeight: 19, color: colors.violet200, backgroundColor: "#07060A", borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, padding: space.md },
  version: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  versionOn: { backgroundColor: tint.selected, borderRadius: radius.sm, paddingHorizontal: space.sm },
  viewing: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: tint.selected, borderWidth: StyleSheet.hairlineWidth, borderColor: tint.selectedBorder },
  switchRow: { flexDirection: "row", alignItems: "center", gap: space.md },
});
