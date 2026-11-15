import { createContext, memo, useContext, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Animated from "react-native-reanimated";
import { AppText, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { KIND_INFO, parseArtifactBody, type ArtifactBlock } from "@/lib/artifact";
import { useEnvironment } from "@/lib/environment";
import { chooseFileFormat, saveArtifactFile } from "@/lib/artifact-file";
import { feedback } from "@/lib/feedback";
import type { ArtifactFull } from "@/lib/types";
import { layoutTransition } from "@/theme/motion";
import { colors, radius, space, tint } from "@/theme/tokens";
import { ArtifactFullscreen, ArtifactPreview } from "./artifact-view";

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

/** Identidade de um artefato dentro da conversa (o mesmo código = o mesmo artefato). */
export function artifactKey(source: string) {
  let h = 5381;
  for (let i = 0; i < source.length; i++) h = ((h << 5) + h + source.charCodeAt(i)) | 0;
  return `${source.length}:${(h >>> 0).toString(36)}`;
}

/**
 * O que a conversa da Kally oferece aos artefatos dela (perguntar.tsx): salvar na biblioteca, salvar como nova
 * versão de um salvo, e o que já foi salvo nesta conversa. Fora da conversa (num pensamento), não há contexto: o
 * artefato só aparece funcionando.
 */
export type ArtifactChat = {
  saved: Record<string, { id: string; version: number }>;
  canSave: boolean;
  save: (block: ArtifactBlock) => Promise<{ id: string; version: number }>;
  saveVersion: (block: ArtifactBlock, id: string) => Promise<{ id: string; version: number }>;
  askFix: (block: ArtifactBlock, errors: string[]) => void;
};
export const ArtifactChatContext = createContext<ArtifactChat | null>(null);

/** Bloco ```artefato numa resposta da Kally: o artefato funcionando, com tela cheia, código e salvar. */
export const ChatArtifact = memo(function ChatArtifact({ body, complete }: { body: string; complete: boolean }) {
  const chat = useContext(ArtifactChatContext);
  const env = useEnvironment();
  const block = useMemo(() => parseArtifactBody(body), [body]);
  const info = KIND_INFO[block.kind];
  const key = artifactKey(block.source);
  const savedHere = chat?.saved[key];
  const [full, setFull] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  if (!complete) {
    return (
      <View style={styles.frame} accessibilityLabel="Artefato sendo construído">
        <View style={styles.head}>
          <Icon name={info.icon} size={15} color={info.color} />
          <AppText variant="label" color={colors.faint} style={{ flex: 1 }} numberOfLines={1}>
            {block.title !== "Artefato" ? `Construindo: ${block.title}` : "Construindo o artefato"}
          </AppText>
          <ActivityIndicator size="small" color={colors.violet300} />
        </View>
        <AppText style={styles.pending} numberOfLines={4}>
          {block.source.split("\n").slice(-4).join("\n") || "…"}
        </AppText>
      </View>
    );
  }

  const run = async (action: () => Promise<{ id: string; version: number }>, done: (r: { id: string; version: number }) => string) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await action();
      feedback.success();
      setMessage(done(r));
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Não deu para salvar.");
    } finally {
      setBusy(false);
    }
  };

  const target = savedHere?.id ?? block.ref;
  const download = async () => {
    const environmentId = env.current?.session.environment.id;
    if (!environmentId) return;
    const format = await chooseFileFormat(block.format === "markdown");
    if (!format) return;
    setBusy(true);
    setMessage(null);
    try {
      const name = await saveArtifactFile(environmentId, format, { title: block.title, format: block.format, source: block.source });
      setMessage(`Arquivo pronto: ${name}`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Não consegui gerar o arquivo.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Animated.View layout={layoutTransition} style={styles.frame}>
      <View style={styles.head}>
        <Icon name={info.icon} size={15} color={info.color} />
        <View style={{ flex: 1 }}>
          <AppText variant="uiMedium" numberOfLines={1}>{block.title}</AppText>
          <AppText variant="label" color={colors.faint}>
            {info.label}
            {block.category ? ` · ${block.category}` : ""}
          </AppText>
        </View>
        <Touchable accessibilityLabel={showCode ? "Esconder o código" : "Ver o código"} onPress={() => setShowCode((v) => !v)} hitSlop={8} style={[styles.chip, showCode && styles.chipOn]}>
          <AppText variant="small" color={showCode ? colors.violet200 : colors.muted}>Código</AppText>
        </Touchable>
        <Touchable accessibilityLabel="Abrir em tela cheia" onPress={() => setFull(true)} hitSlop={8} pressScale={0.9} style={styles.icon}>
          <Icon name="expand" size={15} color={colors.muted} />
        </Touchable>
      </View>
      {block.description ? (
        <AppText variant="small" color={colors.muted} style={styles.description}>
          {block.description}
        </AppText>
      ) : null}
      <ArtifactPreview source={block.source} format={block.format} maxHeight={480} onErrors={setErrors} />
      {showCode ? (
        <View style={styles.code}>
          <AppText selectable style={styles.codeText}>{block.source}</AppText>
        </View>
      ) : null}
      {chat ? (
        <View style={styles.foot}>
          {savedHere ? (
            <Touchable accessibilityRole="button" onPress={() => router.push({ pathname: "/artefato/[id]", params: { id: savedHere.id } })} style={[styles.button, styles.buttonOn]}>
              <Icon name="check" size={15} color={colors.violet200} />
              <AppText variant="small" color={colors.violet200}>Salvo · v{savedHere.version} · Abrir</AppText>
            </Touchable>
          ) : chat.canSave ? (
            target ? (
              <>
                <Touchable accessibilityRole="button" disabled={busy} onPress={() => run(() => chat.saveVersion(block, target), (r) => `Salvo como versão ${r.version}.`)} style={styles.button}>
                  <Icon name="refresh" size={15} color={colors.text} />
                  <AppText variant="small">Salvar como nova versão</AppText>
                </Touchable>
                <Touchable accessibilityRole="button" disabled={busy} onPress={() => run(() => chat.save(block), () => "Salvo como um artefato novo.")} style={[styles.button, styles.ghost]}>
                  <AppText variant="small" color={colors.muted}>Salvar como novo</AppText>
                </Touchable>
              </>
            ) : (
              <Touchable accessibilityRole="button" disabled={busy} onPress={() => run(() => chat.save(block), () => "Salvo na aba Artefatos.")} style={styles.button}>
                <Icon name="cube" size={15} color={colors.text} />
                <AppText variant="small">Salvar na biblioteca</AppText>
              </Touchable>
            )
          ) : (
            <AppText variant="small" color={colors.faint}>Só quem pode publicar neste ambiente salva artefatos.</AppText>
          )}
          <Touchable accessibilityRole="button" disabled={busy} onPress={() => void download()} style={[styles.button, styles.ghost]}>
            <Icon name="doc" size={15} color={colors.muted} />
            <AppText variant="small" color={colors.muted}>{block.format === "markdown" ? "Baixar PDF" : "Baixar"}</AppText>
          </Touchable>
          {errors.length ? (
            <Touchable accessibilityRole="button" onPress={() => chat.askFix(block, errors)} style={[styles.button, styles.danger]}>
              <Icon name="kally" size={15} color={colors.danger} />
              <AppText variant="small" color={colors.danger}>Pedir correção</AppText>
            </Touchable>
          ) : null}
          {busy ? <ActivityIndicator size="small" color={colors.violet300} /> : null}
          {message ? <AppText variant="small" color={colors.faint} style={{ flexBasis: "100%" }}>{message}</AppText> : null}
        </View>
      ) : null}
      <ArtifactFullscreen visible={full} onClose={() => setFull(false)} title={block.title} kind={block.kind} source={block.source} format={block.format} />
    </Animated.View>
  );
});

/** Bloco ```artefato-edicao ainda chegando: o servidor aplica as trocas e devolve o artefato inteiro no fim. */
export function ArtifactEditPending({ complete }: { complete: boolean }) {
  return (
    <View style={[styles.frame, styles.head]}>
      <Icon name="refresh" size={15} color={colors.violet300} />
      <AppText variant="small" color={colors.muted} style={{ flex: 1 }}>
        {complete ? "Aplicando as mudanças no artefato…" : "Escrevendo as mudanças no artefato…"}
      </AppText>
      <ActivityIndicator size="small" color={colors.violet300} />
    </View>
  );
}

/** Bloco ```artefato-ref num pensamento: o artefato salvo, carregado pela biblioteca (com as permissões de quem lê). */
export function EmbeddedArtifact({ id, title }: { id: string; title: string }) {
  const { current } = useEnvironment();
  const [artifact, setArtifact] = useState<ArtifactFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!current) return setError("Abra este pensamento dentro do ambiente para ver o artefato.");
    let alive = true;
    current.api
      .artifact(id)
      .then((r) => alive && setArtifact(r.artifact))
      .catch((cause) => alive && setError(cause instanceof Error ? cause.message : "Artefato indisponível."));
    return () => {
      alive = false;
    };
  }, [current, id]);
  if (!artifact) {
    return (
      <View style={[styles.frame, styles.head]}>
        <Icon name="cube" size={15} color={colors.violet300} />
        <AppText variant="small" color={colors.muted} style={{ flex: 1 }}>{error ? `${title}: ${error}` : `Carregando «${title}»…`}</AppText>
        {!error ? <ActivityIndicator size="small" color={colors.violet300} /> : null}
      </View>
    );
  }
  const info = KIND_INFO[artifact.kind];
  return (
    <View style={styles.frame}>
      <View style={styles.head}>
        <Icon name={info.icon} size={15} color={info.color} />
        <AppText variant="uiMedium" style={{ flex: 1 }} numberOfLines={1}>{artifact.title}</AppText>
        <Touchable accessibilityLabel="Abrir o artefato" onPress={() => router.push({ pathname: "/artefato/[id]", params: { id: artifact.id } })} hitSlop={8} style={styles.chip}>
          <AppText variant="small" color={colors.muted}>Abrir</AppText>
        </Touchable>
        <Touchable accessibilityLabel="Abrir em tela cheia" onPress={() => setFull(true)} hitSlop={8} pressScale={0.9} style={styles.icon}>
          <Icon name="expand" size={15} color={colors.muted} />
        </Touchable>
      </View>
      <ArtifactPreview source={artifact.source} format={artifact.format} maxHeight={520} />
      <ArtifactFullscreen visible={full} onClose={() => setFull(false)} title={artifact.title} kind={artifact.kind} source={artifact.source} format={artifact.format} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { marginBottom: space.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, backgroundColor: colors.surface, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  description: { paddingHorizontal: space.md, paddingVertical: space.sm },
  chip: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong },
  chipOn: { borderColor: tint.selectedBorder, backgroundColor: tint.selected },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  pending: { fontFamily: mono, fontSize: 12, lineHeight: 18, color: colors.faint, padding: space.md },
  code: { margin: space.md, marginBottom: 0, padding: space.md, borderRadius: radius.md, backgroundColor: "#07060A", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, maxHeight: 360, overflow: "hidden" },
  codeText: { fontFamily: mono, fontSize: 12, lineHeight: 18, color: colors.violet200 },
  foot: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm, padding: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  button: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, minHeight: 36, borderRadius: radius.pill, backgroundColor: colors.violet700, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(199,183,250,0.32)" },
  buttonOn: { backgroundColor: tint.selected, borderColor: tint.selectedBorder },
  ghost: { backgroundColor: "transparent", borderColor: colors.lineStrong },
  danger: { backgroundColor: colors.dangerSoft, borderColor: "#4A1C22" },
});
